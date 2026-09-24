/** Split one markdown table line into trimmed cells. */
export const splitCells = (line: string): string[] =>
  line.trim().replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

/** A `| --- |` separator cell. One dash is valid GFM. */
export const isSeparator = (cell: string): boolean => /^:?-+:?$/.test(cell);

export type Columns = Record<string, number>;

/** Map lower-cased header names to their index. */
export const headerColumns = (cells: string[]): Columns => {
  const col: Columns = {};
  cells.forEach((name, j) => { if (name) col[name.toLowerCase()] = j; });
  return col;
};

export const legacyColumns = (names: string[]): Columns => {
  const col: Columns = {};
  names.forEach((n, j) => { col[n] = j; });
  return col;
};

export const getter = (col: Columns, cells: string[]) =>
  (name: string): string => (col[name] != null ? (cells[col[name]] ?? "") : "");
