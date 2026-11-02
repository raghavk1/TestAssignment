/**
 * Temporal Client helper.
 *
 * Provides a singleton Temporal client and a high-level function to
 * execute the hotelOfferWorkflow synchronously (wait for result).
 */
import { Client, Connection, WorkflowFailedError } from '@temporalio/client';
import { config } from '../config';
import { logger } from '../logger';
import { WorkflowResult } from '../types';
import { hotelOfferWorkflow } from './workflows';
import { v4 as uuidv4 } from 'uuid';

let temporalClient: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (!temporalClient) {
    const connection = await Connection.connect({ address: config.temporal.address });
    temporalClient = new Client({
      connection,
      namespace: config.temporal.namespace,
    });
    logger.info(`Temporal client connected to ${config.temporal.address}`);
  }
  return temporalClient;
}

/**
 * Runs the hotelOfferWorkflow and waits for its result.
 * Throws on workflow failure (both suppliers down, no cache).
 */
export async function runHotelOfferWorkflow(city: string): Promise<WorkflowResult> {
  const client = await getTemporalClient();

  const handle = await client.workflow.start(hotelOfferWorkflow, {
    taskQueue: config.temporal.taskQueue,
    workflowId: `hotel-offers-${city.toLowerCase().replace(/\s+/g, '-')}-${uuidv4()}`,
    args: [{ city }],
  });

  logger.info(`[Temporal] Started workflow ${handle.workflowId} for city "${city}"`);

  try {
    const result = await handle.result();
    logger.info(`[Temporal] Workflow ${handle.workflowId} completed`);
    return result;
  } catch (err) {
    if (err instanceof WorkflowFailedError) {
      logger.error(`[Temporal] Workflow failed: ${err.message}`);
      throw new Error(err.message);
    }
    throw err;
  }
}

/**
 * Checks Temporal connectivity with a hard 3 s deadline.
 * Uses a fresh one-shot connection rather than the singleton so a failed
 * attempt doesn't poison the cached client used by runHotelOfferWorkflow.
 */
export async function pingTemporal(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const probePromise = (async () => {
    const start = Date.now();
    let conn: Connection | null = null;
    try {
      conn = await Connection.connect({ address: config.temporal.address });
      await conn.close();
      return { ok: true as const, latencyMs: Date.now() - start };
    } catch (err) {
      if (conn) await conn.close().catch(() => { /* ignore */ });
      return { ok: false as const, error: (err as Error).message };
    }
  })();

  const deadline = new Promise<{ ok: false; error: string }>((res) =>
    setTimeout(() => res({ ok: false, error: 'Temporal ping timeout' }), 3000)
  );

  return Promise.race([probePromise, deadline]);
}

export async function closeTemporal(): Promise<void> {
  if (temporalClient) {
    await temporalClient.connection.close();
    temporalClient = null;
  }
}
