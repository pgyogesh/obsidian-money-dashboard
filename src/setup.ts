import type { Moment } from "moment";
import { ACCT_END, ACCT_START, INBOX_MARK, MONTH_FMT, TXN_END, TXN_START } from "./parse/markers";

export interface PlannedFile {
  path: string;
  content: string;
}

// Invented sample data. No real people, accounts or places beyond public
// neighbourhood names.
const PLACES = {
  mg: "[MG Road, Bengaluru](https://maps.apple.com/?ll=12.9756,77.6050)",
  indira: "[Indiranagar, Bengaluru](https://maps.apple.com/?ll=12.9784,77.6408)",
  kora: "[Koramangala, Bengaluru](https://maps.apple.com/?ll=12.9352,77.6245)",
};

interface Sample {
  day: number; time: string; amount: number; direction: "debit" | "credit";
  merchant: string; category: string; account: string; method: string;
  location: string; description: string;
}

const SAMPLES: Sample[] = [
  { day: 1, time: "09:10", amount: 25000, direction: "debit", merchant: "Sample Landlord", category: "Rent & Home", account: "Everyday Bank", method: "neft", location: "", description: "rent" },
  { day: 1, time: "10:00", amount: 90000, direction: "credit", merchant: "Sample Employer", category: "Income", account: "Everyday Bank", method: "neft", location: "", description: "salary" },
  { day: 2, time: "19:45", amount: 640, direction: "debit", merchant: "Corner Grocer", category: "Groceries", account: "Everyday Bank", method: "upi", location: PLACES.indira, description: "" },
  { day: 3, time: "13:20", amount: 420, direction: "debit", merchant: "City Cafe", category: "Dining & Delivery", account: "Travel Card", method: "credit_card", location: PLACES.mg, description: "lunch" },
  { day: 4, time: "08:05", amount: 1800, direction: "debit", merchant: "Fuel Station", category: "Transport & Fuel", account: "Travel Card", method: "credit_card", location: PLACES.kora, description: "" },
  { day: 5, time: "21:30", amount: 2499, direction: "debit", merchant: "Online Store", category: "Shopping", account: "Shopping Card", method: "credit_card", location: "", description: "shoes" },
  { day: 6, time: "18:00", amount: 5000, direction: "debit", merchant: "Index Fund", category: "Investments", account: "Everyday Bank", method: "upi", location: "", description: "monthly SIP" },
  { day: 7, time: "12:15", amount: 310, direction: "debit", merchant: "City Cafe", category: "", account: "Travel Card", method: "credit_card", location: PLACES.mg, description: "" },
];

const INBOX_HEADER = [
  "| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Location | Description | Raw |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
];

const inboxNote = (rows: string[]) => `---
tags:
  - money
---

# Expenses inbox

The live record of the current month. One row per transaction. Rows go at
the end of this file, below the marker. Nothing but table rows may go below it.

- **Amount** is a plain positive number. **Direction** is \`debit\` or \`credit\`.
- **Category** is the one column you fill by hand. Leave it empty when unsure.
- **Ref** is the bank reference. It tells a repeat payment from a duplicate.

${INBOX_MARK}

${[...INBOX_HEADER, ...rows].join("\n")}
`;

const configNote = `---
tags:
  - money
---

# Money Accounts Config

Billing cycle settings, one row per account. Read by the \`money-accounts\` block.

- **Account** must match the Account value in the inbox exactly.
- **Statement day**: day of month the bill is generated, 1 to 31. Leave blank for a bank account or wallet, which then uses the calendar month.
- **Due day**: optional. **Credit limit**: optional, a plain number.

${ACCT_START}

| Account | Statement day | Due day | Credit limit | Notes |
| --- | --- | --- | --- | --- |
| Everyday Bank | | | | savings, calendar month |
| Travel Card | 18 | 7 | 150000 | |
| Shopping Card | 12 | 30 | 80000 | |

${ACCT_END}
`;

const page = (block: string, cls: string) => `---
cssclasses:
  - money-page
  - ${cls}
---

\`\`\`${block}
\`\`\`
`;

const clampDay = (m: Moment, day: number) => Math.min(day, m.daysInMonth());

const inboxRow = (s: Sample, m: Moment, i: number) => {
  const when = `${m.clone().date(clampDay(m, s.day)).format("YYYY-MM-DD")} ${s.time}`;
  return `| ${when} | ${s.amount.toFixed(2)} | ${s.direction} | ${s.merchant} | ${s.category} | ${s.account} | ${s.method} | SAMPLE${i + 1} | ${s.location} | ${s.description} | sample row |`;
};

const monthNote = (m: Moment) => {
  const rows = SAMPLES.map((s, i) => {
    const date = `${m.clone().date(clampDay(m, s.day + 10)).format("YYYY-MM-DD")} ${s.time}`;
    const amount = s.direction === "credit" ? -s.amount : Math.round(s.amount * 1.1);
    return { line: `| ${date} | ${s.merchant} | ${s.description} | ${s.category || "Other"} | ${s.account} | ${s.method} | ${amount.toFixed(2)} | SAMPLE${i + 1} | ${s.location} | sample row |`, amount, category: s.category };
  });
  const spend = rows.filter((r) => r.amount > 0 && !/^(income|transfer|investments)$/i.test(r.category))
    .reduce((a, r) => a + r.amount, 0);
  return `---
money:
  status: sample
  spend: ${spend}
---

# ${m.format("MMMM YYYY")}

Sample archived month. Delete this note when you have real data.

${TXN_START}

| Date | Merchant | Description | Category | Card | Type | Amount | Notes | Location | Raw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.map((r) => r.line).join("\n")}

${TXN_END}
`;
};

/** What the vault already holds, wherever it is. */
export interface Found {
  inbox: boolean;
  accounts: boolean;
  /** YYYY-MM of every month note already in the vault. */
  monthKeys: Set<string>;
}

const NOTHING: Found = { inbox: false, accounts: false, monthKeys: new Set() };

/**
 * The notes the setup command would create in `folder`, leaving out any path
 * in `existing`. It never overwrites. It also skips the inbox and the config
 * when the vault already has them in another folder, because a second, empty
 * inbox would win the search and hide the real one. A sample month is never
 * added next to a real archive of the same month.
 */
export const planSetup = (folder: string, existing: Set<string>, now: Moment, sample: boolean, found: Found = NOTHING): PlannedFile[] => {
  const at = (name: string) => (folder ? `${folder.replace(/\/+$/, "")}/${name}` : name);
  // Sample rows never land after today, so none of them is in the future.
  const rows = sample
    ? SAMPLES.map((s, i) => inboxRow({ ...s, day: Math.min(s.day, now.date()) }, now, i))
    : [];
  const files: PlannedFile[] = [
    ...(found.inbox ? [] : [{ path: at("Expenses.md"), content: inboxNote(rows) }]),
    ...(found.accounts ? [] : [{ path: at("Money Accounts Config.md"), content: configNote }]),
    { path: at("Money Dashboard.md"), content: page("money-dashboard", "money-dashboard") },
    { path: at("Money Accounts.md"), content: page("money-accounts", "money-accounts") },
    { path: at("Money Map.md"), content: page("money-map", "money-map") },
  ];
  const prev = now.clone().subtract(1, "month").startOf("month");
  if (sample && !found.monthKeys.has(prev.format("YYYY-MM"))) {
    files.push({ path: at(`${prev.format(MONTH_FMT)}.md`), content: monthNote(prev) });
  }
  return files.filter((f) => !existing.has(f.path));
};
