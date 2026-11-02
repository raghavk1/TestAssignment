import winston from 'winston';
import { config } from './config';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isDev = config.nodeEnv === 'development';

export const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: { service: 'hotel-offer-orchestrator' },
  transports: [
    new winston.transports.Console({
      format: isDev ? combine(colorize(), simple()) : combine(timestamp(), json()),
    }),
  ],
});
