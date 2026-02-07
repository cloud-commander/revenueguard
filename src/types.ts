export type SKUId =
  | "sku-001"
  | "sku-002"
  | "sku-003"
  | "sku-004"
  | "sku-005"
  | "sku-006"
  | "sku-007"
  | "sku-008"
  | "sku-009"
  | "sku-010"
  | "sku-011"
  | "sku-012"
  | "sku-013"
  | "sku-014"
  | "sku-015"
  | "sku-016"
  | "sku-017"
  | "sku-018"
  | "sku-019"
  | "sku-020"
  | "sku-021"
  | "sku-022"
  | "sku-023"
  | "sku-024";

export const VALID_SKUS: SKUId[] = [
  "sku-001",
  "sku-002",
  "sku-003",
  "sku-004",
  "sku-005",
  "sku-006",
  "sku-007",
  "sku-008",
  "sku-009",
  "sku-010",
  "sku-011",
  "sku-012",
  "sku-013",
  "sku-014",
  "sku-015",
  "sku-016",
  "sku-017",
  "sku-018",
  "sku-019",
  "sku-020",
  "sku-021",
  "sku-022",
  "sku-023",
  "sku-024",
];

export type InventoryItem = {
  id: SKUId;
  name: string;
  category: string;
  totalStock: number;
  unitPrice: number;
  allocatedUnits: number;
  availableUnits: number;
  isAllocated?: boolean;
};

export type AllocationMode = "safe" | "eventual";

// CONFORMANCE: EDGE_API_SPEC.md - Standard response envelope
export type ApiResponse<T = unknown> = {
  success: boolean; // Root boolean for quick branching
  data?: T; // Payload on success
  error?: {
    code: string; // Machine-readable code (e.g., "OUT_OF_STOCK")
    message: string; // Human-readable message
  };
  meta: {
    requestId: string;
    timestamp: number; // Unix milliseconds
  };
};

export type AllocationPayload = {
  unitsAvailable: number;
  totalAllocated: number;
  revenueGenerated?: number;
  oversellDelta?: number;
};

export type AllocationResponse = ApiResponse<AllocationPayload>;

export type SessionPayload = {
  sessionId: string;
  expiresAt: number; // Unix milliseconds
  ipAddress?: string;
};

export type SessionResponse = ApiResponse<SessionPayload>;

export type AuthMode = "turnstile" | "demo";
