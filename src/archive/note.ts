import { INBOX_MARK, TXN_END, TXN_START } from "../parse/markers";

const section = (table: string) => `${TXN_START}\n\n${table}\n\n${TXN_END}`;

/**
 * Put `table` between the txns markers of a month note and leave every other
 * character alone. A note without markers (for example a Periodic Notes
 * monthly note) gets a money section appended.
 */
export const replaceTable = (noteText: string, table: string): string => {
  const a = noteText.indexOf(TXN_START);
  const b = noteText.indexOf(TXN_END);
  if (a >= 0 && b > a) return noteText.slice(0, a) + section(table) + noteText.slice(b + TXN_END.length);
  return `${noteText.replace(/\s+$/, "")}\n\n## Money\n\n${section(table)}\n`;
};

/** The body of a month note created by archiving. Frontmatter is set afterwards. */
export const newMonthNote = (label: string, table: string): string =>
  `# ${label}\n\nArchived from the inbox by Money Dashboard. Positive is money out, negative is money in.\n\n${section(table)}\n`;

/**
 * Remove every line below the inbox marker whose trimmed text is in `lines`.
 * Nothing above the marker is touched, even a line that reads the same.
 */
export const removeInboxLines = (text: string, lines: Set<string>): string => {
  const at = text.indexOf(INBOX_MARK);
  if (at < 0) return text;
  const cut = at + INBOX_MARK.length;
  const below = text.slice(cut).split("\n").filter((l) => !lines.has(l.trim())).join("\n");
  return text.slice(0, cut) + below;
};
