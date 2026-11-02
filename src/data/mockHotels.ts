import { SupplierHotelOffer } from '../types';

/**
 * Comprehensive mock hotel database.
 * Suppliers A and B share hotel names (causing deduplication) but differ
 * in price and commission to exercise the tie-breaker logic.
 */

const HOTELS_DATA: Record<string, SupplierHotelOffer[]> = {
  // ─── Paris ────────────────────────────────────────────────────────────────
  paris: [
    // Supplier A
    { hotelName: 'Hotel Le Marais', city: 'Paris', price: 180, currency: 'USD', commission: 12, supplier: 'A', roomType: 'Deluxe Double', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Eiffel Boutique Hotel', city: 'Paris', price: 220, currency: 'USD', commission: 10, supplier: 'A', roomType: 'Superior King', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Grand Paris Palace', city: 'Paris', price: 450, currency: 'USD', commission: 8, supplier: 'A', roomType: 'Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Montmartre Inn', city: 'Paris', price: 130, currency: 'USD', commission: 15, supplier: 'A', roomType: 'Standard', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Seine River Lodge', city: 'Paris', price: 195, currency: 'USD', commission: 11, supplier: 'A', roomType: 'River View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    // Supplier B (overlapping hotels with different prices/commissions)
    { hotelName: 'Hotel Le Marais', city: 'Paris', price: 165, currency: 'USD', commission: 9, supplier: 'B', roomType: 'Classic Double', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Eiffel Boutique Hotel', city: 'Paris', price: 220, currency: 'USD', commission: 13, supplier: 'B', roomType: 'Junior Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Grand Paris Palace', city: 'Paris', price: 420, currency: 'USD', commission: 10, supplier: 'B', roomType: 'Prestige Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Champs-Élysées Residences', city: 'Paris', price: 310, currency: 'USD', commission: 9, supplier: 'B', roomType: 'Apartment', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Louvre Gardens Hotel', city: 'Paris', price: 275, currency: 'USD', commission: 14, supplier: 'B', roomType: 'Garden View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  ],

  // ─── New York ─────────────────────────────────────────────────────────────
  'new york': [
    { hotelName: 'Manhattan Grand Hotel', city: 'New York', price: 320, currency: 'USD', commission: 10, supplier: 'A', roomType: 'City View King', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Times Square Inn', city: 'New York', price: 210, currency: 'USD', commission: 12, supplier: 'A', roomType: 'Standard Queen', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Brooklyn Boutique Stay', city: 'New York', price: 175, currency: 'USD', commission: 15, supplier: 'A', roomType: 'Hipster Loft', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Central Park Suites', city: 'New York', price: 480, currency: 'USD', commission: 8, supplier: 'A', roomType: 'Park Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Hudson Yards Hotel', city: 'New York', price: 290, currency: 'USD', commission: 11, supplier: 'A', roomType: 'Deluxe', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Manhattan Grand Hotel', city: 'New York', price: 299, currency: 'USD', commission: 13, supplier: 'B', roomType: 'Premium King', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Times Square Inn', city: 'New York', price: 210, currency: 'USD', commission: 10, supplier: 'B', roomType: 'Classic Queen', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Midtown Executive Hotel', city: 'New York', price: 355, currency: 'USD', commission: 9, supplier: 'B', roomType: 'Executive Floor', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'SoHo Artist Suites', city: 'New York', price: 230, currency: 'USD', commission: 14, supplier: 'B', roomType: 'Studio', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Central Park Suites', city: 'New York', price: 510, currency: 'USD', commission: 7, supplier: 'B', roomType: 'Luxury Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  ],

  // ─── Dubai ────────────────────────────────────────────────────────────────
  dubai: [
    { hotelName: 'Burj Al Arab Annex', city: 'Dubai', price: 950, currency: 'USD', commission: 6, supplier: 'A', roomType: 'Royal Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Marina Walk Hotel', city: 'Dubai', price: 310, currency: 'USD', commission: 11, supplier: 'A', roomType: 'Sea View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Desert Oasis Resort', city: 'Dubai', price: 420, currency: 'USD', commission: 13, supplier: 'A', roomType: 'Oasis Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Downtown Dubai Hotel', city: 'Dubai', price: 280, currency: 'USD', commission: 12, supplier: 'A', roomType: 'Fountain View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'JBR Beachfront Hotel', city: 'Dubai', price: 370, currency: 'USD', commission: 10, supplier: 'A', roomType: 'Beach Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Burj Al Arab Annex', city: 'Dubai', price: 880, currency: 'USD', commission: 8, supplier: 'B', roomType: 'Deluxe Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Marina Walk Hotel', city: 'Dubai', price: 295, currency: 'USD', commission: 14, supplier: 'B', roomType: 'Marina View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'DIFC Business Hotel', city: 'Dubai', price: 340, currency: 'USD', commission: 9, supplier: 'B', roomType: 'Business Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Palm Jumeirah Villas', city: 'Dubai', price: 1200, currency: 'USD', commission: 7, supplier: 'B', roomType: 'Villa', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Downtown Dubai Hotel', city: 'Dubai', price: 280, currency: 'USD', commission: 15, supplier: 'B', roomType: 'Burj View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  ],

  // ─── London ───────────────────────────────────────────────────────────────
  london: [
    { hotelName: 'Mayfair Grand Hotel', city: 'London', price: 395, currency: 'USD', commission: 9, supplier: 'A', roomType: 'Superior Double', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Tower Bridge Inn', city: 'London', price: 215, currency: 'USD', commission: 13, supplier: 'A', roomType: 'Standard Twin', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Kensington Palace Hotel', city: 'London', price: 320, currency: 'USD', commission: 11, supplier: 'A', roomType: 'Garden Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Camden Boutique Stay', city: 'London', price: 145, currency: 'USD', commission: 16, supplier: 'A', roomType: 'Artist Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Canary Wharf Executive', city: 'London', price: 270, currency: 'USD', commission: 10, supplier: 'A', roomType: 'City View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Mayfair Grand Hotel', city: 'London', price: 380, currency: 'USD', commission: 11, supplier: 'B', roomType: 'Classic Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Tower Bridge Inn', city: 'London', price: 230, currency: 'USD', commission: 12, supplier: 'B', roomType: 'River View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Shoreditch Creative Hotel', city: 'London', price: 195, currency: 'USD', commission: 14, supplier: 'B', roomType: 'Loft', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Hyde Park Residences', city: 'London', price: 340, currency: 'USD', commission: 10, supplier: 'B', roomType: 'Park View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Kensington Palace Hotel', city: 'London', price: 305, currency: 'USD', commission: 12, supplier: 'B', roomType: 'Deluxe Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  ],

  // ─── Tokyo ────────────────────────────────────────────────────────────────
  tokyo: [
    { hotelName: 'Shinjuku Tower Hotel', city: 'Tokyo', price: 260, currency: 'USD', commission: 11, supplier: 'A', roomType: 'City View', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Shibuya Crossing Stay', city: 'Tokyo', price: 190, currency: 'USD', commission: 13, supplier: 'A', roomType: 'Standard', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Imperial Palace Hotel', city: 'Tokyo', price: 580, currency: 'USD', commission: 7, supplier: 'A', roomType: 'Imperial Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Akihabara Tech Inn', city: 'Tokyo', price: 120, currency: 'USD', commission: 17, supplier: 'A', roomType: 'Single', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Asakusa Traditional Hotel', city: 'Tokyo', price: 210, currency: 'USD', commission: 14, supplier: 'A', roomType: 'Tatami Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Shinjuku Tower Hotel', city: 'Tokyo', price: 245, currency: 'USD', commission: 12, supplier: 'B', roomType: 'Skyline Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Imperial Palace Hotel', city: 'Tokyo', price: 580, currency: 'USD', commission: 9, supplier: 'B', roomType: 'Palace Suite', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Roppongi Luxury Hotel', city: 'Tokyo', price: 390, currency: 'USD', commission: 10, supplier: 'B', roomType: 'Premium Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Harajuku Trendy Hotel', city: 'Tokyo', price: 170, currency: 'USD', commission: 15, supplier: 'B', roomType: 'Design Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
    { hotelName: 'Shibuya Crossing Stay', city: 'Tokyo', price: 200, currency: 'USD', commission: 11, supplier: 'B', roomType: 'Deluxe', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  ],
};

/**
 * Returns hotel offers for the given city from the specified supplier.
 * Normalises the city key to lowercase for look-ups.
 */
export function getHotelsForSupplier(
  city: string,
  supplier: 'A' | 'B'
): SupplierHotelOffer[] {
  const key = city.toLowerCase().trim();
  const allOffers = HOTELS_DATA[key] ?? [];
  return allOffers.filter((h) => h.supplier === supplier);
}
