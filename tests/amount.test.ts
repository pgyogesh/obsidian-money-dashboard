import { describe, expect, it } from "vitest";
import { num } from "../src/parse/amount";

describe("num", () => {
  it("reads plain and decorated amounts", () => {
    expect(num("1,234.50")).toBe(1234.5);
    expect(num("₹40.00")).toBe(40);
    expect(num(" 12 ")).toBe(12);
    expect(num(7)).toBe(7);
  });
  it("treats brackets and CR as money in", () => {
    expect(num("(1,234)")).toBe(-1234);
    expect(num("500 CR")).toBe(-500);
    expect(num("500 Dr")).toBe(500);
  });
  it("turns anything unreadable into 0", () => {
    expect(num("abc")).toBe(0);
    expect(num("")).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num(NaN)).toBe(0);
    expect(num(Infinity)).toBe(0);
  });
});
