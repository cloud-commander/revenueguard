export const BUSINESS_RULES = {
  PRICE_PER_UNIT: 150,
  DEFAULT_STOCK: 100,
  MAX_UNITS_PER_TRANSACTION: 50,
} as const;

export const VALID_SKUS = [
  "sku-001",
  "sku-002",
  "sku-003",
  "sku-004",
  "sku-005",
] as const;

export function calculateTransactionCost(
  units: number,
  billingScale: number,
): number {
  return units * BUSINESS_RULES.PRICE_PER_UNIT * billingScale;
}

export function calculateVirtualCost(units: number): number {
  return units * BUSINESS_RULES.PRICE_PER_UNIT;
}

export const InventoryRules = {
  validateAllocation: (units: number, availableUnits: number) => {
    if (units <= 0) {
      return {
        isValid: false,
        errorCode: "NEGATIVE_UNITS",
        message: "Units must be > 0",
      };
    }
    if (!Number.isInteger(units)) {
      return {
        isValid: false,
        errorCode: "NON_INTEGER_UNITS",
        message: "Units must be an integer",
      };
    }
    if (units > BUSINESS_RULES.MAX_UNITS_PER_TRANSACTION) {
      return {
        isValid: false,
        errorCode: "EXCEEDS_MAX_TRANSACTION",
        message: "Exceeds max transaction limit",
      };
    }
    if (units > availableUnits) {
      return {
        isValid: false,
        errorCode: "INSUFFICIENT_STOCK",
        message: "Insufficient stock",
      };
    }
    return { isValid: true, errorCode: "", message: "" };
  },
  calculateRevenue: (units: number, billingScale: number = 1.0) => {
    return units * BUSINESS_RULES.PRICE_PER_UNIT * billingScale;
  },
};
