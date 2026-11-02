/**
 * Local Test Suite — No Redis or Temporal required
 * Tests: deduplication logic, supplier mock data, price-range filtering
 *
 * Run: npx ts-node test/test-local.ts
 */
import { deduplicateHotels } from '../src/services/deduplication';
import { getHotelsForSupplier } from '../src/data/mockHotels';
import { SupplierHotelOffer } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function section(name: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📦 ${name}`);
  console.log('─'.repeat(60));
}

// ─── TEST 1: Mock Supplier Data ───────────────────────────────────────────────
section('TEST 1: Mock Supplier Data Integrity');

const CITIES = ['paris', 'new york', 'dubai', 'london', 'tokyo'];

for (const city of CITIES) {
  const offersA = getHotelsForSupplier(city, 'A');
  const offersB = getHotelsForSupplier(city, 'B');
  assert(`Supplier A has offers for ${city}`, offersA.length > 0, `got ${offersA.length}`);
  assert(`Supplier B has offers for ${city}`, offersB.length > 0, `got ${offersB.length}`);
  assert(`All Supplier A offers tagged correctly`, offersA.every(o => o.supplier === 'A'));
  assert(`All Supplier B offers tagged correctly`, offersB.every(o => o.supplier === 'B'));

  // Find hotels that appear in BOTH suppliers (overlap)
  const namesA = new Set(offersA.map(o => o.hotelName.toLowerCase()));
  const namesB = new Set(offersB.map(o => o.hotelName.toLowerCase()));
  const overlap = [...namesA].filter(n => namesB.has(n));
  assert(`${city} has overlapping hotels between suppliers`, overlap.length > 0, `overlap: ${overlap.join(', ')}`);
}

// ─── TEST 2: Deduplication — Cheapest Price Wins ─────────────────────────────
section('TEST 2: Deduplication — Cheapest Price Wins');

const priceTestOffers: SupplierHotelOffer[] = [
  { hotelName: 'Test Hotel', city: 'test', price: 300, currency: 'USD', commission: 10, supplier: 'A', roomType: 'Deluxe', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  { hotelName: 'Test Hotel', city: 'test', price: 250, currency: 'USD', commission: 8,  supplier: 'B', roomType: 'Standard', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  { hotelName: 'Budget Stay', city: 'test', price: 100, currency: 'USD', commission: 15, supplier: 'A', roomType: 'Basic', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
];

const result2 = deduplicateHotels(priceTestOffers);
assert('Deduplication produces 2 unique hotels from 3 offers', result2.length === 2);
const testHotel = result2.find(h => h.hotelName === 'Test Hotel');
assert('Test Hotel picks cheapest price ($250)', testHotel?.price === 250, `got ${testHotel?.price}`);
assert('Test Hotel picks Supplier B (cheaper)', testHotel?.supplier === 'B');
assert('offersConsidered = 2 for Test Hotel', testHotel?.offersConsidered === 2, `got ${testHotel?.offersConsidered}`);
assert('Results are sorted by price ascending', result2[0].price <= result2[1].price);

// ─── TEST 3: Deduplication — Commission Tie-Breaker ──────────────────────────
section('TEST 3: Deduplication — Commission Tie-Breaker (equal prices)');

const tieTestOffers: SupplierHotelOffer[] = [
  { hotelName: 'Tied Hotel', city: 'test', price: 200, currency: 'USD', commission: 10, supplier: 'A', roomType: 'A-Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  { hotelName: 'Tied Hotel', city: 'test', price: 200, currency: 'USD', commission: 15, supplier: 'B', roomType: 'B-Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
];

const result3 = deduplicateHotels(tieTestOffers);
const tiedHotel = result3.find(h => h.hotelName === 'Tied Hotel');
assert('Tie-break: same price → higher commission wins', tiedHotel?.commission === 15, `got commission ${tiedHotel?.commission}`);
assert('Tie-break: Supplier B selected (commission 15% vs 10%)', tiedHotel?.supplier === 'B');

// ─── TEST 4: Deduplication — Supplier A Deterministic Tie-Breaker ────────────
section('TEST 4: Deduplication — Final Tie-Break (same price AND commission)');

const finalTieOffers: SupplierHotelOffer[] = [
  { hotelName: 'Same Hotel', city: 'test', price: 200, currency: 'USD', commission: 12, supplier: 'B', roomType: 'B-Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
  { hotelName: 'Same Hotel', city: 'test', price: 200, currency: 'USD', commission: 12, supplier: 'A', roomType: 'A-Room', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
];

const result4 = deduplicateHotels(finalTieOffers);
const sameHotel = result4.find(h => h.hotelName === 'Same Hotel');
assert('Final tie-break: Supplier A wins when price and commission are equal', sameHotel?.supplier === 'A', `got ${sameHotel?.supplier}`);

// ─── TEST 5: Deduplication — Paris Real Data ─────────────────────────────────
section('TEST 5: Deduplication — Real Paris Dataset');

const parisA = getHotelsForSupplier('paris', 'A');
const parisB = getHotelsForSupplier('paris', 'B');
const allParis = [...parisA, ...parisB];
const dedupedParis = deduplicateHotels(allParis);

console.log(`\n  Raw offers: ${allParis.length}, Deduplicated: ${dedupedParis.length}`);
assert('Paris deduplication reduces offer count', dedupedParis.length < allParis.length);
assert('All deduplicated hotels have valid prices', dedupedParis.every(h => h.price > 0));
assert('All deduplicated hotels have offersConsidered >= 1', dedupedParis.every(h => h.offersConsidered >= 1));
assert('Results sorted by price ascending', dedupedParis.every((h, i) => i === 0 || h.price >= dedupedParis[i-1].price));

// Verify Eiffel Boutique — same price, higher commission should win
const eiffel = dedupedParis.find(h => h.hotelName === 'Eiffel Boutique Hotel');
if (eiffel) {
  // Supplier A: $220, 10%  — Supplier B: $220, 13%
  assert('Eiffel Boutique: same price → higher commission (B, 13%) wins', eiffel.commission === 13, `got commission ${eiffel.commission}`);
  assert('Eiffel Boutique: Supplier B selected', eiffel.supplier === 'B');
}

// Verify Hotel Le Marais — B is cheaper ($165 vs $180)
const leMarais = dedupedParis.find(h => h.hotelName === 'Hotel Le Marais');
if (leMarais) {
  // Supplier A: $180  — Supplier B: $165
  assert('Hotel Le Marais: cheaper price (B, $165) wins', leMarais.price === 165, `got price ${leMarais.price}`);
  assert('Hotel Le Marais: Supplier B selected', leMarais.supplier === 'B');
}

// ─── TEST 6: Price-Range Filtering Logic ─────────────────────────────────────
section('TEST 6: Price-Range Filtering Logic');

const dubaiA = getHotelsForSupplier('dubai', 'A');
const dubaiB = getHotelsForSupplier('dubai', 'B');
const dedupedDubai = deduplicateHotels([...dubaiA, ...dubaiB]);

const minPrice = 200;
const maxPrice = 500;
const filtered = dedupedDubai.filter(h => h.price >= minPrice && h.price <= maxPrice);

assert(`Price filter [${minPrice}-${maxPrice}] returns subset`, filtered.length < dedupedDubai.length);
assert('All filtered hotels within price range', filtered.every(h => h.price >= minPrice && h.price <= maxPrice));
assert('No hotels outside range included', !filtered.some(h => h.price < minPrice || h.price > maxPrice));
console.log(`  Filtered ${dedupedDubai.length} → ${filtered.length} hotels ($${minPrice}–$${maxPrice} range)`);

// ─── TEST 7: Edge Cases ───────────────────────────────────────────────────────
section('TEST 7: Edge Cases');

// Empty input
const emptyResult = deduplicateHotels([]);
assert('Empty offers array returns empty result', emptyResult.length === 0);

// Single offer
const singleOffer: SupplierHotelOffer[] = [
  { hotelName: 'Solo Hotel', city: 'solo', price: 99, currency: 'USD', commission: 20, supplier: 'A', roomType: 'Single', available: true, checkIn: '2026-12-15', checkOut: '2026-12-20' },
];
const singleResult = deduplicateHotels(singleOffer);
assert('Single offer passes through as-is', singleResult.length === 1 && singleResult[0].price === 99);
assert('Single offer has offersConsidered = 1', singleResult[0].offersConsidered === 1);

// Unknown city → empty arrays from mock supplier
const unknownA = getHotelsForSupplier('unknowncity', 'A');
const unknownB = getHotelsForSupplier('unknowncity', 'B');
assert('Unknown city returns empty array for Supplier A', unknownA.length === 0);
assert('Unknown city returns empty array for Supplier B', unknownB.length === 0);

// ─── TEST 8: All 5 Cities Full Pipeline ──────────────────────────────────────
section('TEST 8: Full Pipeline — All 5 Cities');

for (const city of CITIES) {
  const a = getHotelsForSupplier(city, 'A');
  const b = getHotelsForSupplier(city, 'B');
  const deduped = deduplicateHotels([...a, ...b]);

  console.log(`  ${city.padEnd(12)}: A=${a.length} + B=${b.length} raw → ${deduped.length} unique`);
  assert(`${city}: deduplication produces valid output`, deduped.length > 0);
  assert(`${city}: no duplicate hotel names in output`, (() => {
    const names = deduped.map(h => h.hotelName.toLowerCase());
    return names.length === new Set(names).size;
  })());
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`🏁 Test Results: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.error(`\n⚠️  ${failed} test(s) failed!`);
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
}
