import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { runHotelOfferWorkflow } from '../temporal/temporalClient';
import { getAllCachedHotels, getHotelsByPriceRange } from '../redis/redisClient';
import { HotelsApiResponse } from '../types';
import { logger } from '../logger';

export const hotelsRouter = Router();

// ─── Query-string validation schema ──────────────────────────────────────────
const QuerySchema = z.object({
  city: z.string().min(1, 'city is required'),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
});

/**
 * GET /api/hotels?city=<city>
 * GET /api/hotels?city=<city>&minPrice=<min>&maxPrice=<max>
 *
 * Behaviour:
 *  1. Validate query parameters.
 *  2. If minPrice / maxPrice are provided → serve directly from Redis (ZRANGEBYSCORE).
 *  3. Otherwise → trigger Temporal workflow (fan-out → dedup → cache → return).
 *  4. If the workflow is degraded (one supplier failed) → set x-degraded-suppliers header.
 *  5. If both suppliers fail but Redis has stale data → serve stale data with degraded flag.
 *  6. Only 503 if both suppliers fail AND no cache exists.
 */
hotelsRouter.get('/hotels', async (req: Request, res: Response) => {
  // ── 1. Validate input ────────────────────────────────────────────────────
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { city, minPrice, maxPrice } = parsed.data;
  const hasFilter = minPrice !== undefined || maxPrice !== undefined;

  logger.info(`GET /api/hotels city="${city}" minPrice=${minPrice} maxPrice=${maxPrice}`);

  // ── 2. Price-range filter: serve from Redis cache directly ────────────────
  if (hasFilter) {
    const min = minPrice ?? 0;
    const max = maxPrice ?? Number.MAX_SAFE_INTEGER;

    const cached = await getHotelsByPriceRange(city, min, max).catch(() => null);

    if (cached !== null) {
      const response: HotelsApiResponse = {
        city,
        hotels: cached,
        fromCache: true,
        degraded: false,
        total: cached.length,
      };
      return res.json(response);
    }

    // No cache — we need to fetch fresh data first, then filter
    logger.info(`No cache for "${city}"; fetching fresh data before filtering`);
  }

  // ── 3. Trigger Temporal workflow ──────────────────────────────────────────
  try {
    const workflowResult = await runHotelOfferWorkflow(city);

    if (workflowResult.degraded && workflowResult.degradedSuppliers.length > 0) {
      res.setHeader('x-degraded-suppliers', workflowResult.degradedSuppliers.join(', '));
    }

    // If price filter requested, apply it to the freshly fetched results
    let hotels = workflowResult.hotels;
    if (hasFilter) {
      const min = minPrice ?? 0;
      const max = maxPrice ?? Number.MAX_SAFE_INTEGER;
      hotels = hotels.filter((h) => h.price >= min && h.price <= max);
    }

    const response: HotelsApiResponse = {
      city,
      hotels,
      fromCache: false,
      degraded: workflowResult.degraded,
      degradedSuppliers: workflowResult.degradedSuppliers.length > 0
        ? workflowResult.degradedSuppliers
        : undefined,
      total: hotels.length,
    };

    return res.json(response);

  } catch (workflowErr) {
    // ── 4. Workflow failed (both suppliers down) — try stale cache ───────────
    logger.error('Workflow failed, attempting stale cache fallback', {
      err: (workflowErr as Error).message,
    });

    const staleCached = await getAllCachedHotels(city).catch(() => null);

    if (staleCached !== null) {
      let hotels = staleCached;
      if (hasFilter) {
        const min = minPrice ?? 0;
        const max = maxPrice ?? Number.MAX_SAFE_INTEGER;
        hotels = staleCached.filter((h) => h.price >= min && h.price <= max);
      }

      res.setHeader('x-degraded-suppliers', 'Supplier A, Supplier B');

      const response: HotelsApiResponse = {
        city,
        hotels,
        fromCache: true,
        degraded: true,
        degradedSuppliers: ['Supplier A', 'Supplier B'],
        total: hotels.length,
      };

      return res.json(response);
    }

    // ── 5. No cache + both suppliers failed → 503 ───────────────────────────
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'All suppliers are down and no cached data is available for this city.',
      city,
    });
  }
});
