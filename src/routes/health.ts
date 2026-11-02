import { Router, Request, Response } from 'express';
import axios from 'axios';
import { pingRedis } from '../redis/redisClient';
import { pingTemporal } from '../temporal/temporalClient';
import { config } from '../config';
import { HealthResponse, SupplierHealth } from '../types';
import { logger } from '../logger';

export const healthRouter = Router();

const START_TIME = Date.now();

/**
 * GET /health
 *
 * Returns comprehensive health status:
 *  - Service uptime
 *  - Redis connectivity + latency
 *  - Temporal connectivity + latency
 *  - Both supplier endpoints health
 */
healthRouter.get('/health', async (_req: Request, res: Response) => {
  logger.debug('Health check requested');

  // ── Run all checks concurrently ───────────────────────────────────────────
  const [redisResult, temporalResult, supplierChecks] = await Promise.all([
    pingRedis().catch((e) => ({ ok: false as const, error: (e as Error).message })),
    pingTemporal().catch((e) => ({ ok: false as const, error: (e as Error).message })),
    Promise.allSettled([
      checkSupplier('Supplier A', `${config.suppliers.a.url}/supplierA/hotels`, 'paris'),
      checkSupplier('Supplier B', `${config.suppliers.b.url}/supplierB/hotels`, 'paris'),
    ]),
  ]);

  const suppliers: SupplierHealth[] = supplierChecks.map((r) => {
    if (r.status === 'fulfilled') return r.value;
    return { name: 'Unknown', status: 'down', error: 'Check failed unexpectedly' };
  });

  // ── Aggregate overall status ──────────────────────────────────────────────
  const redisDown = !redisResult.ok;
  const temporalDown = !temporalResult.ok;
  const allSuppliersDown = suppliers.every((s) => s.status === 'down');
  const anySuppliersDown = suppliers.some((s) => s.status !== 'healthy');

  let overallStatus: 'healthy' | 'degraded' | 'down';
  if (redisDown && temporalDown && allSuppliersDown) {
    overallStatus = 'down';
  } else if (redisDown || temporalDown || anySuppliersDown) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  const statusCode = overallStatus === 'down' ? 503 : overallStatus === 'degraded' ? 200 : 200;

  const response: HealthResponse = {
    status: overallStatus,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    redis: {
      status: redisResult.ok ? 'healthy' : 'down',
      latencyMs: redisResult.ok && 'latencyMs' in redisResult ? redisResult.latencyMs : undefined,
    },
    temporal: {
      status: temporalResult.ok ? 'healthy' : 'down',
      latencyMs: temporalResult.ok && 'latencyMs' in temporalResult ? temporalResult.latencyMs : undefined,
    },
    suppliers,
  };

  return res.status(statusCode).json(response);
});

async function checkSupplier(
  name: string,
  url: string,
  testCity: string
): Promise<SupplierHealth> {
  const start = Date.now();
  try {
    await axios.get(url, {
      params: { city: testCity },
      timeout: 3000,
    });
    return { name, status: 'healthy', responseTimeMs: Date.now() - start };
  } catch (err) {
    const error = (err as Error).message;
    // Distinguish timeout vs other failures
    const isTimeout = error.includes('timeout') || error.includes('ECONNREFUSED');
    return {
      name,
      status: isTimeout ? 'down' : 'degraded',
      responseTimeMs: Date.now() - start,
      error,
    };
  }
}
