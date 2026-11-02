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
 * Checks Temporal connectivity by attempting a connection.
 */
export async function pingTemporal(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  try {
    const start = Date.now();
    await getTemporalClient();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function closeTemporal(): Promise<void> {
  if (temporalClient) {
    await temporalClient.connection.close();
    temporalClient = null;
  }
}
