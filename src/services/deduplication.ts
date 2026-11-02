import { DeduplicatedHotelOffer, SupplierHotelOffer } from '../types';

/**
 * Core deduplication logic.
 *
 * Rules:
 *  1. Group all offers by hotel name (case-insensitive).
 *  2. For each group keep the offer with the LOWEST price.
 *  3. If prices are EQUAL, keep the offer with the HIGHEST commission rate.
 *  4. If commission is also equal, prefer Supplier A (deterministic tie-break).
 */
export function deduplicateHotels(
  offers: SupplierHotelOffer[]
): DeduplicatedHotelOffer[] {
  // Group by normalised hotel name
  const groups = new Map<string, SupplierHotelOffer[]>();

  for (const offer of offers) {
    const key = offer.hotelName.trim().toLowerCase();
    const bucket = groups.get(key) ?? [];
    bucket.push(offer);
    groups.set(key, bucket);
  }

  const results: DeduplicatedHotelOffer[] = [];

  for (const [, bucket] of groups) {
    // Sort: primary → price ASC, secondary → commission DESC, tertiary → supplier A first
    const sorted = [...bucket].sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      if (a.commission !== b.commission) return b.commission - a.commission;
      // deterministic tie-break: A before B
      return a.supplier.localeCompare(b.supplier);
    });

    const best = sorted[0];

    results.push({
      hotelName: best.hotelName,
      city: best.city,
      price: best.price,
      currency: best.currency,
      commission: best.commission,
      supplier: best.supplier,
      roomType: best.roomType,
      available: best.available,
      checkIn: best.checkIn,
      checkOut: best.checkOut,
      offersConsidered: bucket.length,
    });
  }

  // Return sorted by price ascending for consistent output
  return results.sort((a, b) => a.price - b.price);
}
