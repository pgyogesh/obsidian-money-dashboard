import { describe, expect, it } from "vitest";
import { applyCanonicalMerchants } from "../src/parse/merchant";

describe("applyCanonicalMerchants", () => {
  it("prefers mixed case over frequency", () => {
    const items = [{ merchant: "ZOMATO" }, { merchant: "zomato" }, { merchant: "Zomato" }, { merchant: "zomato" }];
    applyCanonicalMerchants(items);
    expect(items.map((i) => i.merchant)).toEqual(["Zomato", "Zomato", "Zomato", "Zomato"]);
  });
  it("folds extra spaces and leaves distinct names apart", () => {
    const items = [{ merchant: "Zomato  Gold" }, { merchant: "Zomato" }, { merchant: "" }];
    applyCanonicalMerchants(items);
    expect(items.map((i) => i.merchant)).toEqual(["Zomato Gold", "Zomato", ""]);
  });
});
