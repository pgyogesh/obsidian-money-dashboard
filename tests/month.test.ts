import { describe, expect, it } from "vitest";
import { parseMonthTxns } from "../src/parse/month";
import { TXN_END, TXN_START } from "../src/parse/markers";

describe("parseMonthTxns", () => {
  it("returns null without both markers", () => {
    expect(parseMonthTxns("no table")).toBeNull();
    expect(parseMonthTxns(`${TXN_END}\n${TXN_START}`)).toBeNull();
  });
  it("reads the current layout, with Raw and Description apart", () => {
    const text = [
      TXN_START,
      "| Date | Merchant | Description | Category | Card | Type | Amount | Notes | Location | Raw |",
      "| - | - | - | - | - | - | - | - | - | - |",
      "| 2026-07-02 10:00 | Cafe | coffee with team | Dining & Delivery | Card A | upi | 120.50 | paid for two | | SMS text |",
      "| 2026-07-03 | Shop | | | | | -20 | | | refund |",
      TXN_END,
    ].join("\n");
    const r = parseMonthTxns(text)!;
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ merchant: "Cafe", description: "coffee with team; paid for two", desc: "SMS text", amount: 120.5, ref: "" });
    expect(r[1]).toMatchObject({ category: "Uncategorised", card: "Unknown", type: "unknown", amount: -20 });
  });
  it("treats Description as the raw text in an older note without Raw", () => {
    const text = [
      TXN_START,
      "| Date | Description | Merchant | Category | Card | Type | Amount | Notes |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 2026-06-02 | raw sms | Cafe | Other | Card A | upi | 10 | |",
      TXN_END,
    ].join("\n");
    const r = parseMonthTxns(text)!;
    expect(r[0].desc).toBe("raw sms");
    expect(r[0].description).toBe("");
  });
  it("reads the Ref column as the reference", () => {
    const text = [
      TXN_START,
      "| Date | Merchant | Description | Category | Card | Type | Amount | Ref | Location | Raw |",
      "| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |",
      "| 2026-07-02 10:00 | Cafe | | Other | Card A | upi | 10.00 | UTR123 | | sms |",
      TXN_END,
    ].join("\n");
    expect(parseMonthTxns(text)![0].note).toBe("UTR123");
  });
});
