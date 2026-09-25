import { INBOX_MARK } from "../parse/markers";

export type EditResult = { ok: true; text: string } | { ok: false; why: string };

/** The line a row was parsed from, and where it was. */
export interface RowRef {
  srcLine: string;
  srcIndex: number;
  /** Columns in the table's header. A row with fewer cells is padded up to this. */
  width?: number;
}

/**
 * Replace one cell of one inbox row, and return the new file text.
 *
 * The caller passes text read immediately before the write, so a row the
 * Shortcut appended since the page rendered is never lost. The row is found
 * by its remembered line index, which is checked against the line's text. If
 * the row moved, an exact-text search is tried, and an ambiguous match is
 * refused rather than guessed.
 */
/**
 * Where `row` is in `lines` now: its remembered index if the text still
 * matches, else the one line with exactly that text. Lines before `from`
 * never count.
 */
const locate = (lines: string[], row: RowRef, from = 0): { idx: number } | { why: string } => {
  if ((lines[row.srcIndex] ?? "").trim() === row.srcLine && row.srcIndex >= from) return { idx: row.srcIndex };
  const hits: number[] = [];
  lines.forEach((l, i) => { if (i >= from && l.trim() === row.srcLine) hits.push(i); });
  if (hits.length === 1) return { idx: hits[0] };
  return {
    why: hits.length
      ? "that row is no longer unique in the file, so it was not touched"
      : "the row changed on disk, so it was not touched. Reopen the dashboard.",
  };
};

export const replaceCell = (text: string, row: RowRef, cellIndex: number, value: string): EditResult => {
  const lines = text.split("\n");
  const found = locate(lines, row);
  if ("why" in found) return { ok: false, why: found.why };
  const idx = found.idx;
  // Keep the column padding so the table stays aligned until Obsidian next
  // reformats it. +1 for the empty string before the leading pipe.
  let parts = lines[idx].split("|");
  const at = cellIndex + 1;
  const cells = parts.length - 2; // the segments before the first and after the last pipe are not cells
  if (cellIndex < 0) return { ok: false, why: "the row has too few columns" };
  if (cellIndex >= cells) {
    // A model often drops trailing empty cells, so a Shortcut row can be
    // shorter than its header. Add the missing cells, never past the header.
    if (!row.width || cellIndex >= row.width) return { ok: false, why: "the row has too few columns" };
    const line = /\|\s*$/.test(lines[idx]) ? lines[idx] : `${lines[idx].replace(/\s+$/, "")}|`;
    parts = line.split("|");
    const have = parts.length - 2;
    parts.splice(parts.length - 1, 0, ...Array<string>(cellIndex + 1 - have).fill("  "));
  }
  const width = parts[at].length;
  let next = ` ${value}`;
  next += next.length < width ? " ".repeat(width - next.length) : " ";
  parts[at] = next;
  lines[idx] = parts.join("|");
  return { ok: true, text: lines.join("\n") };
};

/**
 * Remove one inbox row. Only a line below the inbox marker can be removed,
 * found the same careful way an edit finds it.
 */
export const removeRow = (text: string, row: RowRef): EditResult => {
  const lines = text.split("\n");
  const mark = lines.findIndex((l) => l.includes(INBOX_MARK));
  if (mark < 0) return { ok: false, why: "the inbox marker is missing, so nothing was deleted" };
  if (row.srcIndex <= mark) return { ok: false, why: "that line is not in the inbox table, so nothing was deleted" };
  const found = locate(lines, row, mark + 1);
  if ("why" in found) return { ok: false, why: found.why.replace("touched", "deleted") };
  lines.splice(found.idx, 1);
  return { ok: true, text: lines.join("\n") };
};

/** A typed pipe would add a column and shift every later value. */
export const cleanFreeText = (v: string): string =>
  String(v).replace(/\|/g, "/").replace(/[\r\n]+/g, " ").trim();
