import { describe, expect, it } from "vitest";
import { normaliseBudgets, parseBudget } from "../src/parse/budget";

describe("budget input", () => {
  it("distinguishes a cleared budget from a zero limit and supports decimals", () => {
    expect(parseBudget("  ")).toBeNull();
    expect(parseBudget("0")).toBe(0);
    expect(parseBudget(" 1250.50 ")).toBe(1250.5);
    expect(parseBudget(".50")).toBe(0.5);
  });

  it.each(["-1", "NaN", "Infinity", "1e3", "₹100", "1,000", "100abc", "1.2.3", "9".repeat(400)])(
    "rejects %s without treating it as a cleared budget", (value) => {
      expect(parseBudget(value)).toBeUndefined();
    });
});

describe("saved budgets", () => {
  it.each([undefined, null, [], "100", 100])("defaults malformed or missing settings to no limits: %s", (value) => {
    expect(normaliseBudgets(value)).toEqual({});
  });

  it("keeps valid numbers, including zero, and rejects malformed entries", () => {
    expect(normaliseBudgets({ Groceries: 2500.5, Shopping: 0, Dining: -1, Travel: Infinity,
      Other: NaN, Farm: "100", "": 50, " ": 100 })).toEqual({ Groceries: 2500.5, Shopping: 0 });
  });
});
