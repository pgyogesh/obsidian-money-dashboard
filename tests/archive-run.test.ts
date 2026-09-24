import moment from "moment";
import { describe, expect, it } from "vitest";
import { previewArchive, runArchive } from "../src/archive/run";
import { INBOX_MARK, TXN_END, TXN_START } from "../src/parse/markers";
import { parseInbox } from "../src/parse/inbox";
import { loadMonths } from "../src/vault/load";
import { obsidianVault } from "../src/vault/obsidian";
import { fakeApp } from "./fakeApp";
import { CATS } from "./helpers";

const NOW = moment("2026-09-10 12:00");
const OPTS = { monthFolder: "Money/Months", byYear: true };
const HEAD = "| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Location | Description | Raw |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";
const AUG1 = "| 2026-08-03 10:00 | 100.00 | debit | Zomato | Dining & Delivery | Card A | credit_card | r1 | | | sms |";
const AUG2 = "| 2026-08-04 09:00 | 20.00 | credit | Shop | Shopping | Card A | credit_card | r2 | | refund | sms |";
const SEP1 = "| 2026-09-02 | 50.00 | debit | Cafe | | Card A | upi | r4 | | | sms |";
const inbox = (rows: string[]) => ["# Inbox", "", INBOX_MARK, "", HEAD, ...rows, ""].join("\n");
const INBOX = "Money/Expenses.md";

const run = (app: unknown) => runArchive(app as never, OPTS, CATS, NOW);

describe("runArchive", () => {
  it("merges into an existing note, keeping its own text and frontmatter", async () => {
    const note = `# August\n\nMy own notes.\n\n${TXN_START}\n\n| Date | Merchant | Category | Card | Type | Amount | Ref |\n| --- | --- | --- | --- | --- | --- | --- |\n| 2026-08-01 | Kiosk | Other | Card A | upi | 10.00 | k1 |\n\n${TXN_END}\n\nAfter the table.\n`;
    const f = fakeApp({ [INBOX]: inbox([AUG1, AUG2, SEP1]), "Journal/2026 - 08-August.md": note });
    f.fm["Journal/2026 - 08-August.md"] = { icon: "x", money: { status: "draft" } };
    const res = await run(f.app);
    expect(res).toMatchObject({ ok: true, months: ["August 2026"], moved: 2, left: 1 });
    const out = f.store["Journal/2026 - 08-August.md"];
    expect(out.startsWith("# August\n\nMy own notes.\n\n")).toBe(true);
    expect(out.endsWith(`${TXN_END}\n\nAfter the table.\n`)).toBe(true);
    expect(out).toContain("| 2026-08-01 | Kiosk |");
    expect(out).toContain("| 2026-08-04 09:00 | Shop | refund | Shopping | Card A | credit_card | -20.00 | r2 |");
    expect(f.fm["Journal/2026 - 08-August.md"]).toMatchObject({ icon: "x", money: { status: "archived", net_spend: 90, txn_count: 3 } });
    expect(parseInbox(f.store[INBOX]).map((r) => r.merchant)).toEqual(["Cafe"]);
    expect(f.store[INBOX]).toContain("# Inbox");
  });

  it("keeps the user's own keys inside money:, and updates the plugin's", async () => {
    const f = fakeApp({ [INBOX]: inbox([AUG1]), "M/2026 - 08-August.md": `# Aug\n\n${TXN_START}\n\n${TXN_END}\n` });
    f.fm["M/2026 - 08-August.md"] = { money: { currency: "INR", statement: "aug.pdf", status: "draft", spend: 1 } };
    await run(f.app);
    expect(f.fm["M/2026 - 08-August.md"].money).toMatchObject({ currency: "INR", statement: "aug.pdf", status: "archived", spend: 100 });
  });

  it("writes a backup of the inbox first", async () => {
    const f = fakeApp({ [INBOX]: inbox([AUG1, SEP1]) });
    const before = f.store[INBOX];
    const res = await run(f.app);
    expect(res.ok && res.backup).toBe("Money/.archive-backups/Expenses-20260910-120000.md");
    expect(f.hidden["Money/.archive-backups/Expenses-20260910-120000.md"]).toBe(before);
  });

  it("creates the month note in the folder when there is none", async () => {
    const f = fakeApp({ [INBOX]: inbox([AUG1, SEP1]) });
    await run(f.app);
    expect(f.store["Money/Months/2026/2026 - 08-August.md"]).toContain("| 2026-08-03 10:00 | Zomato |");
    expect(f.folders.has("Money/Months/2026")).toBe(true);
    expect(f.fm["Money/Months/2026/2026 - 08-August.md"]).toMatchObject({ money: { status: "archived", spend: 100 } });
  });

  it("appends a money section to a monthly note that has none", async () => {
    const f = fakeApp({ [INBOX]: inbox([AUG1]), "Periodic/2026 - 08-August.md": "# August\n\nWent hiking." });
    await run(f.app);
    expect(f.store["Periodic/2026 - 08-August.md"]).toMatch(/^# August\n\nWent hiking\.\n\n## Money\n\n%% money:txns:start %%/);
    expect(f.store["Money/Months/2026/2026 - 08-August.md"]).toBeUndefined();
  });

  it("re-plans at Archive time, so a row added after the preview is not lost", async () => {
    const f = fakeApp({ [INBOX]: inbox([AUG1, SEP1]) });
    const pre = await previewArchive(f.app as never, OPTS, CATS, NOW);
    expect(pre.plan.months[0].moved).toHaveLength(1);
    f.store[INBOX] += "| 2026-08-20 | 5.00 | debit | Late | Other | Card A | upi | r9 | | | sms |\n";
    const res = await run(f.app);
    expect(res).toMatchObject({ ok: true, moved: 2 });
    expect(f.store["Money/Months/2026/2026 - 08-August.md"]).toContain("| Late |");
  });

  it("refuses when blocked, and changes nothing", async () => {
    const f = fakeApp({ [INBOX]: inbox(["| 2026-08-05 | 7.00 | debit | Person | | Bank | upi | r6 | | | sms |"]) });
    const before = { ...f.store };
    const res = await run(f.app);
    expect(res.ok).toBe(false);
    expect(f.store).toEqual(before);
    expect(Object.keys(f.hidden)).toEqual([]);
  });

  it("finds nothing to do the second time", async () => {
    const f = fakeApp({ [INBOX]: inbox([AUG1, AUG2, SEP1]) });
    await run(f.app);
    const after = { ...f.store };
    const res = await run(f.app);
    expect(res).toMatchObject({ ok: false });
    expect(res.ok ? "" : res.why).toMatch(/Nothing to archive/);
    expect(f.store).toEqual(after);
  });

  it("leaves the month's totals on the dashboard unchanged", async () => {
    const f = fakeApp({ [INBOX]: inbox([AUG1, AUG2, SEP1]) });
    const v = obsidianVault(f.app as never);
    const before = (await loadMonths(v, CATS, NOW)).months.find((m) => m.key === "2026-08")!;
    await run(f.app);
    const after = (await loadMonths(v, CATS, NOW)).months.find((m) => m.key === "2026-08")!;
    expect(before.fromInbox).toBe(true);
    expect(after.fromInbox).toBeFalsy();
    expect(after.net).toBe(before.net);
    expect(after.status).toBe("archived");
    expect(after.drift).toBeNull();
  });

  it("says so when there is no inbox", async () => {
    const f = fakeApp({ "a.md": "x" });
    expect(await run(f.app)).toMatchObject({ ok: false, why: expect.stringMatching(/No inbox/) });
  });
});
