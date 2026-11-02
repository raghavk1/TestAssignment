import express, { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { config } from './config';
import { logger } from './logger';
import { hotelsRouter } from './routes/hotels';
import { supplierRouter } from './routes/suppliers';
import { healthRouter } from './routes/health';

export function createApp() {
  const app = express();

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // HTTP request logging
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
    })
  );

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api', hotelsRouter);       // GET /api/hotels
  app.use('/', supplierRouter);         // GET /supplierA/hotels, /supplierB/hotels
  app.use('/', healthRouter);           // GET /health

  // Root welcome
  app.get('/', (_req, res) => {
    res.json({
      service: 'Hotel Offer Orchestrator',
      version: '1.0.0',
      endpoints: {
        hotels: 'GET /api/hotels?city=<city>[&minPrice=<min>&maxPrice=<max>]',
        supplierA: 'GET /supplierA/hotels?city=<city>',
        supplierB: 'GET /supplierB/hotels?city=<city>',
        health: 'GET /health',
      },
      supportedCities: ['paris', 'new york', 'dubai', 'london', 'tokyo'],
    });
  });

  // ── 404 handler ────────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // ── Global error handler ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });

  return app;
}

export { config };
