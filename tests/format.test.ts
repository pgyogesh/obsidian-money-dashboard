import { describe, expect, it } from "vitest";
import { makeFormat } from "../src/parse/format";

describe("makeFormat", () => {
  const f = makeFormat({ currency: "₹", style: "indian" });
  it("formats Indian style", () => {
    expect(f.whole(156729)).toBe("₹1,56,729");
    expect(f.whole(-40.4)).toBe("-₹40");
    expect(f.exact(-40)).toBe("-₹40.00");
    expect(f.exact(1234.5)).toBe("₹1,234.50");
    expect(f.short(156729)).toBe("₹1.57L");
    expect(f.short(25000000)).toBe("₹2.50Cr");
    expect(f.short(1500)).toBe("₹1.5k");
    expect(f.short(999)).toBe("₹999");
    expect(f.short(-156729)).toBe("-₹1.57L");
  });
  it("formats percentages", () => {
    expect(f.pct(1, 0)).toBe("n/a");
    expect(f.pct(1, 4)).toBe("25.0%");
  });
  it("formats international style", () => {
    const g = makeFormat({ currency: "$", style: "international" });
    expect(g.whole(156729)).toBe("$156,729");
    expect(g.short(2500000)).toBe("$2.50M");
    expect(g.short(3200000000)).toBe("$3.20B");
    expect(g.short(1500)).toBe("$1.5k");
  });
});
