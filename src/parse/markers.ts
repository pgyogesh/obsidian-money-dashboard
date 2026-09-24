// The format contract. These strings live in the user's notes, so changing
// one breaks every existing vault.
export const INBOX_MARK = "%% money:inbox:start %%"; // table runs to end of file
export const TXN_START = "%% money:txns:start %%";
export const TXN_END = "%% money:txns:end %%";
export const ACCT_START = "%% money:accounts:start %%";
export const ACCT_END = "%% money:accounts:end %%";
/** Periodic Notes monthly format, leaf name only. */
export const MONTH_FMT = "YYYY - MM-MMMM";
/** A transaction date may or may not carry a time. Both sort as plain text. */
export const DATE_FMTS = ["YYYY-MM-DD HH:mm", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD"];
