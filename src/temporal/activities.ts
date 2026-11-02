/**
 * Temporal Activity definitions.
 *
 * Activities are plain async functions that perform I/O (HTTP calls, Redis writes).
 * They run in the Worker process and can be retried by Temporal on failure.
 *
 * IMPORTANT: This file must NOT import from @temporalio/workflow — activity
 * implementations live in the worker context, not the workflow sandbox.
 */
import axios from 'axios';
import { config } from '../config';
import { logger } from '../logger';
import { SupplierHotelOffer } from '../types';
import { saveHotelsToCache } from '../redis/redisClient';
import { DeduplicatedHotelOffer } from '../types';

/** Activity input types */
export interface FetchSupplierOffersInput {
  city: string;
  supplierUrl: string;
  supplierKey: 'A' | 'B';
  timeoutMs: number;
}

export interface CacheHotelsInput {
  city: string;
  hotels: DeduplicatedHotelOffer[];
}

/**
 * Fetches hotel offers from Supplier A.
 * Temporal will retry this on transient failure per the retry policy
 * defined in the workflow.
 */
export async function fetchSupplierAOffers(city: string): Promise<SupplierHotelOffer[]> {
  const url = `${config.suppliers.a.url}/supplierA/hotels`;
  logger.info(`[Activity] Fetching Supplier A offers for "${city}" from ${url}`);

  const response = await axios.get<SupplierHotelOffer[]>(url, {
    params: { city },
    timeout: config.suppliers.a.timeout,
  });

  logger.info(`[Activity] Supplier A returned ${response.data.length} offers for "${city}"`);
  return response.data;
}

/**
 * Fetches hotel offers from Supplier B.
 */
export async function fetchSupplierBOffers(city: string): Promise<SupplierHotelOffer[]> {
  const url = `${config.suppliers.b.url}/supplierB/hotels`;
  logger.info(`[Activity] Fetching Supplier B offers for "${city}" from ${url}`);

  const response = await axios.get<SupplierHotelOffer[]>(url, {
    params: { city },
    timeout: config.suppliers.b.timeout,
  });

  logger.info(`[Activity] Supplier B returned ${response.data.length} offers for "${city}"`);
  return response.data;
}

/**
 * Persists deduplicated hotel offers to Redis.
 * Wrapped as an activity so Temporal can track its execution and retry on failure.
 */
export async function cacheHotelsActivity(input: CacheHotelsInput): Promise<void> {
  await saveHotelsToCache(input.city, input.hotels);
  logger.info(`[Activity] Cached ${input.hotels.length} hotels for "${input.city}"`);
}
