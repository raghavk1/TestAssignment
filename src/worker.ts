/**
 * Temporal Worker entrypoint.
 *
 * Run this process separately from the API server:
 *   npm run worker
 *
 * The worker:
 *  - Polls the Temporal task queue for workflow and activity tasks
 *  - Executes workflow logic (sandboxed) and activity implementations (I/O)
 *  - Must be co-located with the Redis client since activities write to Redis
 */
import 'dotenv/config';
import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './temporal/activities';
import { config } from './config';
import { logger } from './logger';

async function runWorker() {
  logger.info(`Connecting Temporal Worker to ${config.temporal.address}`);

  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    // Tell the worker where to find our workflow definitions
    workflowsPath: require.resolve('./temporal/workflows'),
    activities,
  });

  logger.info(
    `🔧 Temporal Worker started — queue: "${config.temporal.taskQueue}", namespace: "${config.temporal.namespace}"`
  );

  // Run until the process is killed
  await worker.run();
}

runWorker().catch((err) => {
  logger.error('Fatal Worker error', { err: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
