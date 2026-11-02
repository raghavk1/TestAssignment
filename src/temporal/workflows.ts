/**
 * Temporal Workflow: hotelOfferWorkflow
 *
 * Orchestrates the fan-out to both suppliers in parallel, deduplicates results,
 * persists to Redis, and returns the merged hotel list.
 *
 * Workflow code runs inside a deterministic sandbox — no direct I/O allowed.
 * All I/O is delegated to Activities.
 *
 * Resilience strategy:
 *  - Each supplier activity has its own try/catch so a failure in one supplier
 *    does NOT abort the workflow.
 *  - If BOTH suppliers fail AND no cache data is available, the workflow throws.
 */
import {
  proxyActivities,
  ActivityFailure,
  log,
} from '@temporalio/workflow';
import type {
  fetchSupplierAOffers,
  fetchSupplierBOffers,
  cacheHotelsActivity,
} from './activities';
import { deduplicateHotels } from '../services/deduplication';
import { WorkflowResult, SupplierHotelOffer } from '../types';

// Proxy the activities — Temporal injects the actual implementations at runtime
const activities = proxyActivities<{
  fetchSupplierAOffers: typeof fetchSupplierAOffers;
  fetchSupplierBOffers: typeof fetchSupplierBOffers;
  cacheHotelsActivity: typeof cacheHotelsActivity;
}>({
  // Each supplier call gets up to 2 attempts with a 6s schedule-to-close
  startToCloseTimeout: '6s',
  retry: {
    maximumAttempts: 2,
    initialInterval: '500ms',
    backoffCoefficient: 2,
    nonRetryableErrorTypes: [],
  },
});

export interface HotelOfferWorkflowInput {
  city: string;
}

/**
 * Main workflow function executed by the Temporal Worker.
 */
export async function hotelOfferWorkflow(
  input: HotelOfferWorkflowInput
): Promise<WorkflowResult> {
  const { city } = input;

  log.info(`[Workflow] Starting hotel offer aggregation for city: ${city}`);

  const degradedSuppliers: string[] = [];
  let allOffers: SupplierHotelOffer[] = [];

  // ── Fan-out: run both supplier fetches concurrently ──────────────────────
  const [resultA, resultB] = await Promise.allSettled([
    activities.fetchSupplierAOffers(city),
    activities.fetchSupplierBOffers(city),
  ]);

  // ── Collect results, track failures ──────────────────────────────────────
  if (resultA.status === 'fulfilled') {
    log.info(`[Workflow] Supplier A: ${resultA.value.length} offers received`);
    allOffers = allOffers.concat(resultA.value);
  } else {
    const reason = resultA.reason as ActivityFailure;
    log.warn(`[Workflow] Supplier A failed: ${reason?.message ?? 'unknown error'}`);
    degradedSuppliers.push('Supplier A');
  }

  if (resultB.status === 'fulfilled') {
    log.info(`[Workflow] Supplier B: ${resultB.value.length} offers received`);
    allOffers = allOffers.concat(resultB.value);
  } else {
    const reason = resultB.reason as ActivityFailure;
    log.warn(`[Workflow] Supplier B failed: ${reason?.message ?? 'unknown error'}`);
    degradedSuppliers.push('Supplier B');
  }

  // ── Guard: if both suppliers failed, propagate the error ─────────────────
  if (allOffers.length === 0) {
    throw new Error(
      `All suppliers failed for city "${city}". Failed suppliers: ${degradedSuppliers.join(', ')}`
    );
  }

  // ── Deduplicate ──────────────────────────────────────────────────────────
  const deduplicated = deduplicateHotels(allOffers);
  log.info(
    `[Workflow] Deduplicated ${allOffers.length} raw offers → ${deduplicated.length} unique hotels`
  );

  // ── Persist to Redis ─────────────────────────────────────────────────────
  await activities.cacheHotelsActivity({ city, hotels: deduplicated });

  return {
    hotels: deduplicated,
    degraded: degradedSuppliers.length > 0,
    degradedSuppliers,
  };
}
