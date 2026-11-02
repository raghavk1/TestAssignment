import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../logger';
import { DeduplicatedHotelOffer } from '../types';

let redisClient: Redis | null = null;

/** Redis key helpers */
export const redisKeys = {
  /** ZSET: hotelName → price (score) for a city */
  zset: (city: string) => `hotels:${city.toLowerCase()}:prices`,
  /** HASH: hotelName → JSON-encoded DeduplicatedHotelOffer */
  hash: (city: string) => `hotels:${city.toLowerCase()}:data`,
};

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error', { err: err.message }));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }
  return redisClient;
}

/**
 * Saves deduplicated hotel offers to Redis using:
 *  - ZSET  → hotel name scored by price (for ZRANGEBYSCORE range queries)
 *  - HASH  → hotel name → full JSON payload
 *
 * Both keys share the same TTL.
 */
export async function saveHotelsToCache(
  city: string,
  hotels: DeduplicatedHotelOffer[]
): Promise<void> {
  const redis = getRedisClient();
  const zsetKey = redisKeys.zset(city);
  const hashKey = redisKeys.hash(city);

  const pipeline = redis.pipeline();

  // Clear existing data for this city
  pipeline.del(zsetKey);
  pipeline.del(hashKey);

  for (const hotel of hotels) {
    // ZADD: score = price, member = hotel name
    pipeline.zadd(zsetKey, hotel.price, hotel.hotelName);
    // HSET: field = hotel name, value = JSON payload
    pipeline.hset(hashKey, hotel.hotelName, JSON.stringify(hotel));
  }

  // Set TTL on both keys
  pipeline.expire(zsetKey, config.redis.cacheTtl);
  pipeline.expire(hashKey, config.redis.cacheTtl);

  await pipeline.exec();
  logger.info(`Cached ${hotels.length} hotels for city "${city}" (TTL ${config.redis.cacheTtl}s)`);
}

/**
 * Retrieves hotels from Redis within the specified price range.
 * Uses ZRANGEBYSCORE to get hotel names then HMGET to fetch full payloads.
 */
export async function getHotelsByPriceRange(
  city: string,
  minPrice: number,
  maxPrice: number
): Promise<DeduplicatedHotelOffer[] | null> {
  const redis = getRedisClient();
  const zsetKey = redisKeys.zset(city);
  const hashKey = redisKeys.hash(city);

  // Check if data is cached
  const exists = await redis.exists(zsetKey);
  if (!exists) return null;

  // Get hotel names within the price range
  const hotelNames = await redis.zrangebyscore(zsetKey, minPrice, maxPrice);
  if (hotelNames.length === 0) return [];

  // Fetch full data for those hotels
  const rawData = await redis.hmget(hashKey, ...hotelNames);
  const hotels: DeduplicatedHotelOffer[] = rawData
    .filter((d): d is string => d !== null)
    .map((d) => JSON.parse(d) as DeduplicatedHotelOffer);

  logger.info(`Cache HIT: ${hotels.length} hotels for "${city}" in range [${minPrice}–${maxPrice}]`);
  return hotels;
}

/**
 * Retrieves ALL cached hotels for a city (no price filter).
 */
export async function getAllCachedHotels(
  city: string
): Promise<DeduplicatedHotelOffer[] | null> {
  const redis = getRedisClient();
  const zsetKey = redisKeys.zset(city);
  const hashKey = redisKeys.hash(city);

  const exists = await redis.exists(zsetKey);
  if (!exists) return null;

  const hotelNames = await redis.zrange(zsetKey, 0, -1);
  if (hotelNames.length === 0) return [];

  const rawData = await redis.hmget(hashKey, ...hotelNames);
  const hotels: DeduplicatedHotelOffer[] = rawData
    .filter((d): d is string => d !== null)
    .map((d) => JSON.parse(d) as DeduplicatedHotelOffer);

  logger.info(`Cache HIT: ${hotels.length} hotels for "${city}" (all)`);
  return hotels;
}

/**
 * Pings Redis to check latency.
 */
export async function pingRedis(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  try {
    const start = Date.now();
    const redis = getRedisClient();
    await redis.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
