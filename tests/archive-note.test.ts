import { describe, expect, it } from "vitest";
import { newMonthNote, removeLines, replaceTable } from "../src/archive/note";
import { TXN_END, TXN_START } from "../src/parse/markers";

const TABLE = "| Date | X |\n| --- | --- |\n| 2026-07-01 | y |";

describe("replaceTable", () => {
  it("replaces only the text between the markers", () => {
    const note = `---\nicon: x\n---\n# July\n\nMy own notes.\n\n${TXN_START}\n\n| old |\n\n${TXN_END}\n\nMore of my text.\n`;
    const out = replaceTable(note, TABLE);
    expect(out).toBe(`---\nicon: x\n---\n# July\n\nMy own notes.\n\n${TXN_START}\n\n${TABLE}\n\n${TXN_END}\n\nMore of my text.\n`);
  });
  it("appends a money section when the note has no markers", () => {
    const out = replaceTable("# July\n\nJournal.", TABLE);
    expect(out).toBe(`# July\n\nJournal.\n\n## Money\n\n${TXN_START}\n\n${TABLE}\n\n${TXN_END}\n`);
  });
});

describe("newMonthNote", () => {
  it("holds a heading and the table between the markers", () => {
    const n = newMonthNote("July 2026", TABLE);
    expect(n.startsWith("# July 2026\n")).toBe(true);
    expect(n).toContain(`${TXN_START}\n\n${TABLE}\n\n${TXN_END}`);
  });
});

describe("removeLines", () => {
  it("removes only the named lines, compared trimmed", () => {
    expect(removeLines("a\n  | x |  \n| y |\n| x |", new Set(["| x |"]))).toBe("a\n| y |");
  });
});
