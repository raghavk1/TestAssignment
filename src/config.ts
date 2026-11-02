import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    cacheTtl: parseInt(process.env.REDIS_CACHE_TTL || '300', 10), // seconds
  },

  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'hotel-offers',
  },

  suppliers: {
    a: {
      url: process.env.SUPPLIER_A_URL || 'http://localhost:3000',
      timeout: parseInt(process.env.SUPPLIER_TIMEOUT_MS || '5000', 10),
    },
    b: {
      url: process.env.SUPPLIER_B_URL || 'http://localhost:3000',
      timeout: parseInt(process.env.SUPPLIER_TIMEOUT_MS || '5000', 10),
    },
  },

  logLevel: process.env.LOG_LEVEL || 'info',
} as const;

export type Config = typeof config;
