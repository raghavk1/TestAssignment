# Hotel Offer Orchestrator

> **Tripare — Senior Full Stack / Backend Developer Technical Assignment**  
> Node.js · TypeScript · Temporal · Redis · Docker

A production-grade backend microservice that aggregates hotel offers from two mock suppliers in parallel, deduplicates overlapping inventory, caches results in Redis for fast price-range filtering, and orchestrates the entire fan-out via a **Temporal workflow**.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Running with Docker Compose (Recommended)](#running-with-docker-compose-recommended)
   - [Running Locally (Development)](#running-locally-development)
4. [API Reference](#api-reference)
5. [Deduplication Logic](#deduplication-logic)
6. [Redis Caching Strategy](#redis-caching-strategy)
7. [Resilience & Degraded Mode](#resilience--degraded-mode)
8. [Temporal Workflow](#temporal-workflow)
9. [Sample cURL / Postman Requests](#sample-curl--postman-requests)
10. [Environment Variables](#environment-variables)
11. [Design Decisions](#design-decisions)

---

## Architecture Overview

```
                         ┌──────────────────────────────────────────────┐
                         │              Express API Server               │
                         │                  (port 3000)                  │
                         │                                               │
                         │  GET /api/hotels?city=<city>                 │
                         │  GET /api/hotels?city=<city>&min=&max=       │
                         │  GET /supplierA/hotels?city=<city>           │
                         │  GET /supplierB/hotels?city=<city>           │
                         │  GET /health                                  │
                         └──────────┬────────────────────────────────────┘
                                    │
                     Has price filter?
                    ┌───────────────┴───────────────────┐
                    │ YES                               │ NO
                    ▼                                   ▼
          ┌─────────────────┐              ┌───────────────────────┐
          │  Redis Cache    │              │   Temporal Client     │
          │  ZRANGEBYSCORE  │              │  starts workflow run  │
          │  (instant resp) │              └──────────┬────────────┘
          └─────────────────┘                         │
                                                      ▼
                                         ┌────────────────────────┐
                                         │  hotelOfferWorkflow    │
                                         │  (Temporal Worker)     │
                                         │                        │
                                         │  Promise.allSettled([  │
                                         │    fetchSupplierA(),   │
                                         │    fetchSupplierB(),   │
                                         │  ])                    │
                                         └──────────┬─────────────┘
                                                    │
                                    ┌───────────────┴───────────────┐
                                    │                               │
                              ┌─────▼──────┐                 ┌──────▼────┐
                              │ Supplier A │                 │Supplier B │
                              │ /supplierA │                 │/supplierB │
                              │ /hotels    │                 │/hotels    │
                              └─────┬──────┘                 └──────┬────┘
                                    │                               │
                                    └───────────────┬───────────────┘
                                                    ▼
                                         ┌──────────────────────┐
                                         │  Deduplication       │
                                         │  (cheapest price,    │
                                         │  highest commission  │
                                         │  as tie-breaker)     │
                                         └──────────┬───────────┘
                                                    ▼
                                         ┌──────────────────────┐
                                         │  Redis Write         │
                                         │  ZADD (ZSET)         │
                                         │  HSET (HASH)         │
                                         │  TTL = 300s          │
                                         └──────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **Express API** | HTTP server handling all inbound requests |
| **Supplier Mocks** | Built-in mock endpoints simulating real supplier APIs |
| **Temporal Workflow** | Orchestrates fan-out, handles partial failures, deduplicates |
| **Temporal Worker** | Executes workflow & activity tasks, separate process |
| **Redis** | ZSET for price-score index + HASH for full offer payloads |
| **Deduplication Service** | Pure function: cheapest price → highest commission tie-break |

---

## Project Structure

```
hotel-offer-orchestrator/
├── src/
│   ├── config.ts                    # Centralised env-var config
│   ├── logger.ts                    # Winston logger
│   ├── types.ts                     # Shared TypeScript interfaces
│   ├── app.ts                       # Express app factory
│   ├── index.ts                     # API server entrypoint
│   ├── worker.ts                    # Temporal Worker entrypoint
│   ├── data/
│   │   └── mockHotels.ts            # Mock hotel inventory (5 cities)
│   ├── redis/
│   │   └── redisClient.ts           # Redis client, ZSET/HASH helpers
│   ├── services/
│   │   └── deduplication.ts         # Deduplication + tie-break logic
│   ├── temporal/
│   │   ├── activities.ts            # Temporal Activity implementations
│   │   ├── workflows.ts             # Temporal Workflow definition
│   │   └── temporalClient.ts        # Temporal client singleton
│   └── routes/
│       ├── hotels.ts                # GET /api/hotels handler
│       ├── suppliers.ts             # GET /supplierA|B/hotels handlers
│       └── health.ts                # GET /health handler
├── temporal-config/
│   └── development-sql.yaml         # Temporal dynamic config
├── docker-compose.yml               # Full stack (Redis + Temporal + API + Worker)
├── Dockerfile                       # Multi-stage production image
├── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

---

## Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Docker & Docker Compose | ≥ 24 |

---

### Running with Docker Compose (Recommended)

This starts **Redis**, **Temporal** (with Postgres backend), **Temporal UI**, the **API server**, and the **Temporal Worker** — all wired together.

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/hotel-offer-orchestrator.git
cd hotel-offer-orchestrator

# 2. Start everything
docker compose up --build

# Services will be available at:
#   API:          http://localhost:3000
#   Temporal UI:  http://localhost:8080
#   Redis:        localhost:6379
```

> **Note:** Temporal takes ~30 seconds to initialise on first run. The API and Worker containers will retry until Temporal is ready.

To stop and clean up:

```bash
docker compose down -v
```

---

### Running Locally (Development)

You will need Redis and Temporal running locally (or via Docker).

```bash
# Start Redis and Temporal only
docker compose up redis temporal temporal-postgres -d

# Install dependencies
npm install

# Copy env file and adjust as needed
cp .env.example .env

# Terminal 1: Start the API server (with hot-reload)
npm run dev

# Terminal 2: Start the Temporal Worker (with hot-reload)
npm run worker
```

---

## API Reference

### `GET /api/hotels?city=<city>`

Fetches all hotel offers for a city. Triggers the Temporal workflow:
- Fans out to Supplier A and Supplier B in parallel
- Deduplicates by hotel name (cheapest price wins)
- Caches the result in Redis
- Returns the deduplicated JSON array

**Response:**
```json
{
  "city": "paris",
  "hotels": [
    {
      "hotelName": "Hotel Le Marais",
      "city": "Paris",
      "price": 165,
      "currency": "USD",
      "commission": 9,
      "supplier": "B",
      "roomType": "Classic Double",
      "available": true,
      "checkIn": "2026-12-15",
      "checkOut": "2026-12-20",
      "offersConsidered": 2
    }
  ],
  "fromCache": false,
  "degraded": false,
  "total": 8
}
```

---

### `GET /api/hotels?city=<city>&minPrice=<min>&maxPrice=<max>`

Filters cached hotels by price range **directly from Redis** (`ZRANGEBYSCORE`). No workflow is triggered if a valid cache exists.

**Example:** `/api/hotels?city=dubai&minPrice=200&maxPrice=500`

**Response headers (degraded mode):**
```
x-degraded-suppliers: Supplier A
```

---

### `GET /supplierA/hotels?city=<city>`

Mock Supplier A endpoint. Returns raw hotel offers for the city.

---

### `GET /supplierB/hotels?city=<city>`

Mock Supplier B endpoint. Returns raw hotel offers for the city.

---

### `GET /health`

Reports service and all dependency health.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 42,
  "timestamp": "2026-11-02T13:00:00.000Z",
  "redis": { "status": "healthy", "latencyMs": 1 },
  "temporal": { "status": "healthy", "latencyMs": 8 },
  "suppliers": [
    { "name": "Supplier A", "status": "healthy", "responseTimeMs": 95 },
    { "name": "Supplier B", "status": "healthy", "responseTimeMs": 142 }
  ]
}
```

**Supported cities:** `paris`, `new york`, `dubai`, `london`, `tokyo`

---

## Deduplication Logic

Located in [`src/services/deduplication.ts`](src/services/deduplication.ts).

1. **Group** all offers by hotel name (case-insensitive).
2. For each group, **sort by**:
   - `price` **ascending** (cheapest first)
   - `commission` **descending** (highest commission as tie-breaker when prices are equal)
   - `supplier` alphabetically (deterministic A-before-B as final tie-breaker)
3. **Keep the first item** (best offer) from each sorted group.
4. The `offersConsidered` field on each result shows how many raw offers were merged.

**Example:**
| Hotel | Supplier | Price | Commission | Winner? |
|-------|----------|-------|------------|---------|
| Grand Paris Palace | A | $450 | 8% | ❌ |
| Grand Paris Palace | B | $420 | 10% | ✅ (cheaper) |
| Eiffel Boutique | A | $220 | 10% | ❌ |
| Eiffel Boutique | B | $220 | 13% | ✅ (same price, higher commission) |

---

## Redis Caching Strategy

For each city, two Redis keys are maintained:

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `hotels:<city>:prices` | **ZSET** | Hotel name → price (score). Enables `ZRANGEBYSCORE` for instant price-range filtering |
| `hotels:<city>:data` | **HASH** | Hotel name → full JSON payload. Enables `HMGET` bulk retrieval |

Both keys share a configurable **TTL** (default: 300 seconds).

**Price-range query flow:**
```
ZRANGEBYSCORE hotels:paris:prices 100 300
→ ["Hotel Le Marais", "Montmartre Inn", ...]

HMGET hotels:paris:data "Hotel Le Marais" "Montmartre Inn" ...
→ ["{...}", "{...}", ...]
```

This approach avoids full table scans and scales to millions of hotels.

---

## Resilience & Degraded Mode

| Scenario | Behaviour |
|----------|-----------|
| One supplier times out | Workflow continues with the healthy supplier's data; response includes `"degraded": true` and `x-degraded-suppliers` header |
| Both suppliers fail, cache exists | Stale cached data returned with `"degraded": true` |
| Both suppliers fail, no cache | `503 Service Unavailable` |
| Redis unavailable | Workflow still runs; fresh data returned without caching (graceful degradation) |

Temporal's **automatic retry** (up to 2 attempts per activity) handles transient supplier failures before the workflow marks a supplier as degraded.

---

## Temporal Workflow

The `hotelOfferWorkflow` in [`src/temporal/workflows.ts`](src/temporal/workflows.ts):

```
hotelOfferWorkflow(city)
  │
  ├── Promise.allSettled([
  │     fetchSupplierAOffers(city),   ← Activity (retried by Temporal)
  │     fetchSupplierBOffers(city),   ← Activity (retried by Temporal)
  │   ])
  │
  ├── Collect fulfilled results, record failed suppliers
  │
  ├── [Guard] Both failed? → throw (triggers stale-cache fallback in API layer)
  │
  ├── deduplicateHotels(allOffers)    ← pure function (in-workflow)
  │
  └── cacheHotelsActivity(...)        ← Activity (writes to Redis)
```

**Why Temporal?**
- **Durability**: If the worker crashes mid-workflow, Temporal replays from the last completed activity automatically.
- **Observability**: All workflow executions are visible in the Temporal Web UI at `http://localhost:8080`.
- **Retry policies**: Each activity has configurable retries without any manual retry loop code.

---

## Sample cURL / Postman Requests

### Fetch all hotels for Paris
```bash
curl -s "http://localhost:3000/api/hotels?city=paris" | jq .
```

### Fetch hotels in Dubai between $200–$500
```bash
curl -s "http://localhost:3000/api/hotels?city=dubai&minPrice=200&maxPrice=500" | jq .
```

### Fetch hotels in New York under $300
```bash
curl -s "http://localhost:3000/api/hotels?city=new%20york&maxPrice=300" | jq .
```

### Check degraded header (fetch, then inspect headers)
```bash
curl -v "http://localhost:3000/api/hotels?city=london" 2>&1 | grep -i degraded
```

### Supplier A raw data
```bash
curl -s "http://localhost:3000/supplierA/hotels?city=tokyo" | jq .
```

### Supplier B raw data
```bash
curl -s "http://localhost:3000/supplierB/hotels?city=tokyo" | jq .
```

### Health check
```bash
curl -s "http://localhost:3000/health" | jq .
```

### Price-range filter (served from Redis cache after first fetch)
```bash
# First fetch (triggers workflow + caches)
curl -s "http://localhost:3000/api/hotels?city=paris" > /dev/null

# Second call with price filter (served from Redis instantly)
curl -s "http://localhost:3000/api/hotels?city=paris&minPrice=150&maxPrice=300" | jq .
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment mode |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(empty)_ | Redis auth password |
| `REDIS_CACHE_TTL` | `300` | Cache TTL in seconds |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal gRPC address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `hotel-offers` | Temporal task queue name |
| `SUPPLIER_A_URL` | `http://localhost:3000` | Base URL for Supplier A |
| `SUPPLIER_B_URL` | `http://localhost:3000` | Base URL for Supplier B |
| `SUPPLIER_TIMEOUT_MS` | `5000` | Supplier HTTP timeout (ms) |
| `LOG_LEVEL` | `info` | Winston log level |

---

## Design Decisions

- **Temporal over raw Promise.allSettled**: Temporal provides durability, automatic retries, and a full audit trail of all workflow executions. The `Promise.allSettled` fan-out pattern is implemented *inside* the workflow for concurrent supplier fetching.

- **ZSET + HASH duality**: Using both a sorted set and a hash for the same city allows O(log N) price-range queries via `ZRANGEBYSCORE` while preserving the full offer payload in the hash — no data redundancy beyond an extra key.

- **Supplier mocks co-located in the same server**: For simplicity in this assignment, both mock supplier endpoints (`/supplierA/hotels`, `/supplierB/hotels`) run within the same Express process. In production these would be separate services.

- **Zod validation**: All incoming query parameters are validated with Zod for type safety and clear error messages.

- **Graceful degradation**: The API never fails completely as long as one supplier or a stale cache is available, matching the resilience requirements exactly.
