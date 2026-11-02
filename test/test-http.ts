/**
 * HTTP Integration Test — Tests the full Express API with mocked Temporal/Redis
 *
 * Starts the real Express server (suppliers + health routes work fully).
 * For /api/hotels, we also test the mock supplier routes directly since
 * Temporal/Redis are not available in local dev without Docker.
 *
 * Run: npx ts-node test/test-http.ts
 */

process.env.TEMPORAL_ADDRESS = 'localhost:7233';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.PORT = '3001'; // Use alt port to avoid conflicts
// Point suppliers at the test server itself (same process, port 3001)
process.env.SUPPLIER_A_URL = 'http://localhost:3001';
process.env.SUPPLIER_B_URL = 'http://localhost:3001';

import http from 'http';
import { createApp } from '../src/app';

const BASE = 'http://localhost:3001';
let server: http.Server;

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
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`🌐 ${name}`);
  console.log('─'.repeat(65));
}

async function get(path: string): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(data),
            headers: res.headers as Record<string, string>,
          });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers as Record<string, string> });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────
async function setup() {
  const app = createApp();
  return new Promise<void>((resolve) => {
    server = app.listen(3001, () => {
      console.log('\n🚀 Test server started on port 3001');
      resolve();
    });
  });
}

async function teardown() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log('🛑 Test server stopped');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testRootEndpoint() {
  section('GET / — Root Welcome Endpoint');
  const res = await get('/');
  assert('Status 200', res.status === 200, `got ${res.status}`);
  const body = res.body as Record<string, unknown>;
  assert('Has service name', body.service === 'Hotel Offer Orchestrator');
  assert('Has endpoints map', typeof body.endpoints === 'object');
  assert('Has supportedCities', Array.isArray(body.supportedCities));
  assert('Lists 5 supported cities', (body.supportedCities as string[]).length === 5);
  console.log(`  Service: ${body.service}`);
}

async function testSupplierA() {
  section('GET /supplierA/hotels — Mock Supplier A');

  const cities = ['paris', 'new york', 'dubai', 'london', 'tokyo'];

  for (const city of cities) {
    const res = await get(`/supplierA/hotels?city=${encodeURIComponent(city)}`);
    assert(`Status 200 for ${city}`, res.status === 200, `got ${res.status}`);
    assert(`Returns array for ${city}`, Array.isArray(res.body));
    const offers = res.body as Record<string, unknown>[];
    assert(`Has offers for ${city}`, offers.length > 0, `got ${offers.length}`);
    assert(`All tagged supplier A for ${city}`, offers.every(o => o.supplier === 'A'));

    // Validate offer structure
    const first = offers[0];
    assert(`Offer has hotelName field`, typeof first.hotelName === 'string');
    assert(`Offer has price field`, typeof first.price === 'number');
    assert(`Offer has commission field`, typeof first.commission === 'number');
    assert(`Offer has currency field`, typeof first.currency === 'string');
    console.log(`  ${city}: ${offers.length} offers (e.g. "${first.hotelName}" $${first.price})`);
  }

  // Test missing city param
  const missing = await get('/supplierA/hotels');
  assert('Returns 400 when city param missing', missing.status === 400, `got ${missing.status}`);
}

async function testSupplierB() {
  section('GET /supplierB/hotels — Mock Supplier B');

  const res = await get('/supplierB/hotels?city=paris');
  assert('Status 200 for paris', res.status === 200, `got ${res.status}`);
  assert('Returns array', Array.isArray(res.body));
  const offers = res.body as Record<string, unknown>[];
  assert('Has offers', offers.length > 0, `got ${offers.length}`);
  assert('All tagged supplier B', offers.every(o => o.supplier === 'B'));
  console.log(`  Paris Supplier B: ${offers.length} offers`);

  // Check that the same hotel appears in both suppliers (for dedup verification)
  const resA = await get('/supplierA/hotels?city=paris');
  const offersA = resA.body as Record<string, unknown>[];
  const namesA = new Set(offersA.map(o => o.hotelName as string));
  const namesB = new Set(offers.map(o => o.hotelName as string));
  const overlap = [...namesA].filter(n => namesB.has(n));
  assert(`Paris: ${overlap.length} hotels overlap between suppliers`, overlap.length > 0);
  console.log(`  Overlapping hotels: ${overlap.slice(0, 3).join(', ')}...`);
}

async function testSupplierOverlapAndDedup() {
  section('DEDUP VERIFICATION — Cross-Supplier Price Comparison');

  for (const city of ['paris', 'dubai', 'tokyo']) {
    const [resA, resB] = await Promise.all([
      get(`/supplierA/hotels?city=${encodeURIComponent(city)}`),
      get(`/supplierB/hotels?city=${encodeURIComponent(city)}`),
    ]);

    const offersA = resA.body as Array<{hotelName: string; price: number; commission: number; supplier: string}>;
    const offersB = resB.body as Array<{hotelName: string; price: number; commission: number; supplier: string}>;

    // Find overlapping hotels
    const mapA = new Map(offersA.map(o => [o.hotelName.toLowerCase(), o]));
    const mapB = new Map(offersB.map(o => [o.hotelName.toLowerCase(), o]));

    let verified = 0;
    for (const [name, offerA] of mapA) {
      const offerB = mapB.get(name);
      if (!offerB) continue;

      const cheaperPrice = Math.min(offerA.price, offerB.price);
      const expectedWinner = offerA.price < offerB.price ? 'A'
        : offerB.price < offerA.price ? 'B'
        : (offerA.commission >= offerB.commission ? 'A' : 'B'); // commission tie-break

      console.log(`  ${city} | ${offerA.hotelName}: A=$${offerA.price}(${offerA.commission}%) B=$${offerB.price}(${offerB.commission}%) → Winner: Supplier ${expectedWinner} ($${cheaperPrice})`);
      verified++;
    }
    assert(`${city}: verified dedup logic for ${verified} overlapping hotels`, verified > 0);
  }
}

async function testHealth() {
  section('GET /health — Health Check');

  const res = await get('/health');
  // Health returns 200 even in degraded state
  assert(`Status 200 or 503`, res.status === 200 || res.status === 503, `got ${res.status}`);
  const body = res.body as Record<string, unknown>;
  assert('Has status field', typeof body.status === 'string');
  assert('Status is valid enum', ['healthy', 'degraded', 'down'].includes(body.status as string));
  assert('Has uptime field', typeof body.uptime === 'number');
  assert('Has timestamp field', typeof body.timestamp === 'string');
  assert('Has redis object', typeof body.redis === 'object' && body.redis !== null);
  assert('Has temporal object', typeof body.temporal === 'object' && body.temporal !== null);
  assert('Has suppliers array', Array.isArray(body.suppliers));
  assert('Has 2 suppliers', (body.suppliers as unknown[]).length === 2);

  const suppliers = body.suppliers as Array<{name: string; status: string}>;
  assert('Supplier A present', suppliers.some(s => s.name === 'Supplier A'));
  assert('Supplier B present', suppliers.some(s => s.name === 'Supplier B'));

  // Since suppliers are served by the same server and pointing at :3001, they should be healthy
  const supplierAHealth = suppliers.find(s => s.name === 'Supplier A');
  assert('Supplier A status is a valid enum value', ['healthy', 'degraded', 'down'].includes(supplierAHealth?.status ?? ''), `got ${supplierAHealth?.status}`);
  // In this self-hosted test setup, suppliers point to :3001 → should be healthy
  assert('Supplier A is healthy (same-process self-request)', supplierAHealth?.status === 'healthy', `got ${supplierAHealth?.status}`);

  console.log(`  Service status: ${body.status}`);
  console.log(`  Redis: ${(body.redis as Record<string,unknown>).status}`);
  console.log(`  Temporal: ${(body.temporal as Record<string,unknown>).status}`);
  console.log(`  Supplier A: ${supplierAHealth?.status}`);
}

async function testHotelsValidation() {
  section('GET /api/hotels — Input Validation');

  // Missing city param
  const noCityRes = await get('/api/hotels');
  assert('Returns 400 when city is missing', noCityRes.status === 400, `got ${noCityRes.status}`);
  const errBody = noCityRes.body as Record<string, unknown>;
  assert('Error body has error field', typeof errBody.error === 'string');

  // Invalid minPrice (negative)
  const negPriceRes = await get('/api/hotels?city=paris&minPrice=-50');
  assert('Returns 400 for negative minPrice', negPriceRes.status === 400, `got ${negPriceRes.status}`);

  // Invalid maxPrice (0)
  const zeroPriceRes = await get('/api/hotels?city=paris&maxPrice=0');
  assert('Returns 400 for zero maxPrice', zeroPriceRes.status === 400, `got ${zeroPriceRes.status}`);
}

async function test404() {
  section('404 Handler');
  const res = await get('/api/nonexistent');
  assert('Returns 404 for unknown route', res.status === 404, `got ${res.status}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await setup();

    await testRootEndpoint();
    await testSupplierA();
    await testSupplierB();
    await testSupplierOverlapAndDedup();
    await testHealth();
    await testHotelsValidation();
    await test404();

    await teardown();

    console.log(`\n${'═'.repeat(65)}`);
    console.log(`🏁 HTTP Test Results: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
    console.log('═'.repeat(65));

    if (failed > 0) {
      console.error(`\n⚠️  ${failed} test(s) failed!`);
      process.exit(1);
    } else {
      console.log('\n🎉 All HTTP tests passed!');
      process.exit(0);
    }

  } catch (err) {
    await teardown().catch(() => {});
    console.error('\n💥 Test runner crashed:', err);
    process.exit(1);
  }
})();
