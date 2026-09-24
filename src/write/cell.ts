export type EditResult = { ok: true; text: string } | { ok: false; why: string };

/** The line a row was parsed from, and where it was. */
export interface RowRef {
  srcLine: string;
  srcIndex: number;
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
export const replaceCell = (text: string, row: RowRef, cellIndex: number, value: string): EditResult => {
  const lines = text.split("\n");
  let idx = row.srcIndex;
  if ((lines[idx] ?? "").trim() !== row.srcLine) {
    const hits: number[] = [];
    lines.forEach((l, i) => { if (l.trim() === row.srcLine) hits.push(i); });
    if (hits.length !== 1) {
      return {
        ok: false, why: hits.length
          ? "that row is no longer unique in the file, so it was not touched"
          : "the row changed on disk, so it was not touched. Reopen the dashboard.",
      };
    }
    idx = hits[0];
  }
  // Keep the column padding so the table stays aligned until Obsidian next
  // reformats it. +1 for the empty string before the leading pipe.
  const parts = lines[idx].split("|");
  const at = cellIndex + 1;
  if (cellIndex < 0 || parts.length - 1 <= at) return { ok: false, why: "the row has too few columns" };
  const width = parts[at].length;
  let next = ` ${value}`;
  next += next.length < width ? " ".repeat(width - next.length) : " ";
  parts[at] = next;
  lines[idx] = parts.join("|");
  return { ok: true, text: lines.join("\n") };
};

/** A typed pipe would add a column and shift every later value. */
export const cleanFreeText = (v: string): string =>
  String(v).replace(/\|/g, "/").replace(/[\r\n]+/g, " ").trim();
