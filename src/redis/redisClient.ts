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
      // Stop retrying after 5 attempts (~2s total). Without this the client
      // floods the console with ECONNREFUSED every 2 s when Redis isn't running.
      retryStrategy: (times) => {
        if (times > 5) {
          logger.warn('Redis unavailable — retries exhausted, operating without cache');
          return null; // stop retrying
        }
        return Math.min(times * 200, 1000);
      },
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    // Log only the very first error; all subsequent retry errors are swallowed
    // via the catch-all listener so ioredis never emits 'Unhandled error event'.
    redisClient.once('error', (err) => logger.warn(`Redis not available: ${err.message}`));
    redisClient.on('error', () => { /* swallow retry errors silently */ });
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
 * Uses a one-shot probe client with zero retries and a hard 2.5 s
 * deadline via Promise.race so the health check always resolves fast.
 * The error listener prevents Node from crashing on ECONNREFUSED.
 */
export async function pingRedis(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const probePromise = new Promise<{ ok: boolean; latencyMs?: number; error?: string }>(
    (resolve) => {
      const probe = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        connectTimeout: 2000,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      // Must attach error listener or Node will throw an unhandled error event
      probe.on('error', () => { /* handled in the catch below */ });

      const start = Date.now();
      probe
        .connect()
        .then(() => probe.ping())
        .then(() => {
          const latencyMs = Date.now() - start;
          probe.quit().catch(() => { /* ignore */ });
          resolve({ ok: true, latencyMs });
        })
        .catch((err: Error) => {
          probe.disconnect();
          resolve({ ok: false, error: err.message });
        });
    }
  );

  // Hard ceiling so the health route is never blocked longer than 2.5 s
  const deadline = new Promise<{ ok: boolean; error: string }>((res) =>
    setTimeout(() => res({ ok: false, error: 'Ping timeout' }), 2500)
  );

  return Promise.race([probePromise, deadline]);
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
