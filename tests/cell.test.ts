import { describe, expect, it } from "vitest";
import { cleanFreeText, replaceCell } from "../src/write/cell";

const text = "x\n| a | b    | c |\n| a | b    | c |";
const row = (srcIndex: number, srcLine = "| a | b    | c |") => ({ srcLine, srcIndex });

describe("replaceCell", () => {
  it("edits the remembered line when it still matches, even with a twin row", () => {
    expect(replaceCell(text, row(2), 1, "Z")).toEqual({ ok: true, text: "x\n| a | b    | c |\n| a | Z    | c |" });
  });
  it("refuses when the row moved and its text is no longer unique", () => {
    const r = replaceCell(text, row(0), 1, "Z");
    expect(r.ok).toBe(false);
  });
  it("follows a row that moved but is still unique", () => {
    const r = replaceCell("new\nx\n| a | b | c |", { srcLine: "| a | b | c |", srcIndex: 1 }, 2, "Q");
    expect(r).toEqual({ ok: true, text: "new\nx\n| a | b | Q |" });
  });
  it("refuses when the row is gone", () => {
    expect(replaceCell(text, row(1, "| q |"), 0, "Z").ok).toBe(false);
  });
  it("refuses a column the row does not have", () => {
    expect(replaceCell(text, row(1), 9, "Z").ok).toBe(false);
  });
  it("grows the cell for a longer value", () => {
    const r = replaceCell("| a | b |", row(0, "| a | b |"), 1, "long");
    expect(r).toEqual({ ok: true, text: "| a | long |" });
  });
  it("keeps other lines and line endings intact", () => {
    const r = replaceCell("| a | b |\nlast\n", row(0, "| a | b |"), 0, "z");
    expect(r).toEqual({ ok: true, text: "| z | b |\nlast\n" });
  });
});

describe("replaceCell on a row shorter than its header", () => {
  it("adds the missing trailing cells, up to the header width, then writes", () => {
    const r = replaceCell("| a | b |", { srcLine: "| a | b |", srcIndex: 0, width: 4 }, 3, "note");
    expect(r).toEqual({ ok: true, text: "| a | b |  | note |" });
  });
  it("handles a row written without spaces or a closing pipe", () => {
    const r = replaceCell("|a|b", { srcLine: "|a|b", srcIndex: 0, width: 3 }, 2, "x");
    expect(r).toEqual({ ok: true, text: "|a|b| x |" });
  });
  it("still refuses a column past the header width", () => {
    expect(replaceCell("| a | b |", { srcLine: "| a | b |", srcIndex: 0, width: 2 }, 3, "x").ok).toBe(false);
  });
});

describe("cleanFreeText", () => {
  it("replaces pipes and flattens newlines", () => {
    expect(cleanFreeText(" a|b ")).toBe("a/b");
    expect(cleanFreeText("one\ntwo")).toBe("one two");
  });
});
