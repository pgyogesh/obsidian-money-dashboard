import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("styles.css", "utf8");

describe("styles.css", () => {
  it("scopes the hide rule to the plugin's own block", () => {
    // Notes also carry the cssclass money-dashboard, so this rule must not
    // match through the note: only through the block element.
    expect(css).not.toMatch(/body \.money-dashboard \.is-hidden/);
    expect(css).toMatch(/body \.md-block \.is-hidden/);
  });
  it("never uses !important, which the plugin review flags", () => {
    expect(css.match(/!important/g) ?? []).toEqual([]);
  });
  it("has no rules for Dataview's own block", () => {
    expect(css).not.toMatch(/block-language-dataviewjs/);
  });
});
