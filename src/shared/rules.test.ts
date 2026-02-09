import { describe, it, expect } from "vitest";
import { InventoryRules } from "./rules";
import { BUSINESS_RULES } from "./constants";

describe("InventoryRules", () => {
  describe("validateAllocation", () => {
    it("should accept valid allocation", () => {
      const result = InventoryRules.validateAllocation(10, 100);
      expect(result.isValid).toBe(true);
    });

    it("should reject zero units", () => {
      const result = InventoryRules.validateAllocation(0, 100);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe("NEGATIVE_UNITS");
    });

    it("should reject negative units", () => {
      const result = InventoryRules.validateAllocation(-1, 100);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe("NEGATIVE_UNITS");
    });

    it("should reject non-integer units", () => {
      const result = InventoryRules.validateAllocation(1.5, 100);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe("NON_INTEGER_UNITS");
    });

    it("should reject units exceeding max per transaction", () => {
      const result = InventoryRules.validateAllocation(
        BUSINESS_RULES.MAX_UNITS_PER_TRANSACTION + 1,
        100,
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe("EXCEEDS_MAX_TRANSACTION");
    });

    it("should accept units equal to max per transaction", () => {
      const result = InventoryRules.validateAllocation(
        BUSINESS_RULES.MAX_UNITS_PER_TRANSACTION,
        100,
      );
      expect(result.isValid).toBe(true);
    });

    it("should reject units exceeding available stock", () => {
      const result = InventoryRules.validateAllocation(10, 5);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe("INSUFFICIENT_STOCK");
    });
  });

  describe("calculateRevenue", () => {
    it("should calculate correct revenue with scale", () => {
      const revenue = InventoryRules.calculateRevenue(10, 0.000001);
      const expected = 10 * BUSINESS_RULES.PRICE_PER_UNIT * 0.000001;
      expect(revenue).toBeCloseTo(expected, 10);
    });

    it("should handle large quantities without precision loss", () => {
      const units = 1000000;
      const scale = 1.0;
      const revenue = InventoryRules.calculateRevenue(units, scale);
      const expected = units * BUSINESS_RULES.PRICE_PER_UNIT;
      expect(revenue).toBe(expected);
    });

    it("should handle zero scale (free mode)", () => {
      const revenue = InventoryRules.calculateRevenue(10, 0);
      expect(revenue).toBe(0);
    });
  });
});
