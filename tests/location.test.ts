import { describe, expect, it } from "vitest";
import { locParts, parseLoc } from "../src/parse/location";

describe("locParts", () => {
  it("drops the leading comma and keeps the link", () => {
    expect(locParts("[, Pune, MH](https://x)")).toEqual({ label: "Pune, MH", url: "https://x" });
  });
  it("keeps a bare label and ignores a dash", () => {
    expect(locParts("Pune")).toEqual({ label: "Pune", url: "" });
    expect(locParts("-")).toBeNull();
    expect(locParts("")).toBeNull();
  });
  it("refuses a non-http link target", () => {
    expect(locParts("[Sample Place](javascript:alert(1))")?.url).toBe("");
  });
});

describe("parseLoc", () => {
  it("reads coordinates from an Apple Maps link", () => {
    expect(parseLoc("[Sample Place](https://maps.apple.com/?ll=12.97,77.59)")).toEqual({ lat: 12.97, lng: 77.59, label: "Sample Place" });
  });
  it("reads bare coordinates", () => {
    expect(parseLoc("12.97, 77.59")).toMatchObject({ lat: 12.97, lng: 77.59 });
  });
  it("keeps a place name with no coordinates", () => {
    expect(parseLoc("Pune")).toEqual({ lat: null, lng: null, label: "Pune" });
    expect(parseLoc("")).toBeNull();
  });
});
