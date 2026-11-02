/** Raw offer as returned by a supplier */
export interface SupplierHotelOffer {
  hotelName: string;
  city: string;
  price: number;       // nightly rate in USD
  currency: string;
  commission: number;  // percentage e.g. 10 means 10%
  supplier: 'A' | 'B';
  roomType: string;
  available: boolean;
  checkIn: string;     // ISO date
  checkOut: string;    // ISO date
}

/** Best offer after deduplication */
export interface DeduplicatedHotelOffer {
  hotelName: string;
  city: string;
  price: number;
  currency: string;
  commission: number;
  supplier: 'A' | 'B';
  roomType: string;
  available: boolean;
  checkIn: string;
  checkOut: string;
  offersConsidered: number; // how many raw offers were merged
}

/** Response envelope from /api/hotels */
export interface HotelsApiResponse {
  city: string;
  hotels: DeduplicatedHotelOffer[];
  fromCache: boolean;
  degraded: boolean;
  degradedSuppliers?: string[];
  total: number;
}

/** Supplier health info */
export interface SupplierHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTimeMs?: number;
  error?: string;
}

/** Health-check response */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  timestamp: string;
  redis: { status: string; latencyMs?: number };
  temporal: { status: string; latencyMs?: number };
  suppliers: SupplierHealth[];
}

/** Result from the Temporal workflow */
export interface WorkflowResult {
  hotels: DeduplicatedHotelOffer[];
  degraded: boolean;
  degradedSuppliers: string[];
}
