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

/** A typed pipe would add a column and shift every later value. */
export const cleanFreeText = (v: string): string =>
  String(v).replace(/\|/g, "/").replace(/[\r\n]+/g, " ").trim();
