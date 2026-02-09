import { BUSINESS_RULES } from "./constants";

export interface AllocationValidationResult {
  isValid: boolean;
  errorCode?:
    | "NEGATIVE_UNITS"
    | "NON_INTEGER_UNITS"
    | "EXCEEDS_MAX_TRANSACTION"
    | "OUT_OF_STOCK";
  message?: string;
}

export const InventoryRules = {
  /**
   * Validates an allocation request before processing.
   */
  validateAllocation: (
    units: number,
    availableUnits: number,
  ): AllocationValidationResult => {
    if (units <= 0) {
      return {
        isValid: false,
        errorCode: "NEGATIVE_UNITS",
        message: "Units must be greater than zero.",
      };
    }

    if (!Number.isInteger(units)) {
      return {
        isValid: false,
        errorCode: "NON_INTEGER_UNITS",
        message: "Units must be an integer.",
      };
    }

    if (units > BUSINESS_RULES.MAX_UNITS_PER_TRANSACTION) {
      return {
        isValid: false,
        errorCode: "EXCEEDS_MAX_TRANSACTION",
        message: `Cannot allocate more than ${BUSINESS_RULES.MAX_UNITS_PER_TRANSACTION} units in a single transaction.`,
      };
    }

    if (units > availableUnits) {
      return {
        isValid: false,
        errorCode: "OUT_OF_STOCK",
        message: "Insufficient stock.",
      };
    }

    return { isValid: true };
  },

  /**
   * Calculates revenue for a given number of units.
   */
  calculateRevenue: (units: number, billingScale: number): number => {
    return units * BUSINESS_RULES.PRICE_PER_UNIT * billingScale;
  },
};
