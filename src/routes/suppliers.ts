import { Router, Request, Response } from 'express';
import { getHotelsForSupplier } from '../data/mockHotels';
import { logger } from '../logger';

export const supplierRouter = Router();

/**
 * GET /supplierA/hotels?city=<city>
 *
 * Mock Supplier A endpoint. Returns hotel offers for the requested city.
 * Simulates a slight random delay to mimic a real external API.
 */
supplierRouter.get('/supplierA/hotels', async (req: Request, res: Response) => {
  const city = req.query.city as string;

  if (!city || city.trim() === '') {
    return res.status(400).json({ error: 'Missing required query parameter: city' });
  }

  // Simulate network latency (50–200ms)
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));

  const offers = getHotelsForSupplier(city, 'A');
  logger.debug(`Supplier A: ${offers.length} offers for "${city}"`);

  return res.json(offers);
});

/**
 * GET /supplierB/hotels?city=<city>
 *
 * Mock Supplier B endpoint. Returns hotel offers for the requested city.
 * Simulates a slightly longer random delay.
 */
supplierRouter.get('/supplierB/hotels', async (req: Request, res: Response) => {
  const city = req.query.city as string;

  if (!city || city.trim() === '') {
    return res.status(400).json({ error: 'Missing required query parameter: city' });
  }

  // Simulate network latency (80–300ms)
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 220));

  const offers = getHotelsForSupplier(city, 'B');
  logger.debug(`Supplier B: ${offers.length} offers for "${city}"`);

  return res.json(offers);
});
