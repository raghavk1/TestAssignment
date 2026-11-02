/**
 * Application entrypoint.
 *
 * Starts the Express HTTP server and initialises connections to Redis.
 * The Temporal Worker is started separately via `src/worker.ts` to
 * mirror a production microservice topology.
 */
import 'dotenv/config';
import { createApp, config } from './app';
import { getRedisClient, closeRedis } from './redis/redisClient';
import { logger } from './logger';

async function bootstrap() {
  // ── Eagerly connect to Redis ───────────────────────────────────────────────
  try {
    const redis = getRedisClient();
    await redis.connect();
    logger.info('Redis connection established');
  } catch (err) {
    logger.warn('Could not connect to Redis at startup — will retry on demand', {
      err: (err as Error).message,
    });
  }

  // ── Start HTTP server ─────────────────────────────────────────────────────
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`🚀 Hotel Offer Orchestrator listening on port ${config.port}`);
    logger.info(`   Environment : ${config.nodeEnv}`);
    logger.info(`   Redis       : ${config.redis.host}:${config.redis.port}`);
    logger.info(`   Temporal    : ${config.temporal.address}`);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    server.close(async () => {
      await closeRedis();
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Fatal startup error', { err: (err as Error).message });
  process.exit(1);
});
