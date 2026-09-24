/** Text of a cell or frontmatter value. Anything but a string or a number is empty. */
export const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
