import moment from "moment";
import { describe, expect, it } from "vitest";
import { parseAccounts } from "../src/parse/accounts";
import { parseInbox } from "../src/parse/inbox";
import { parseMonthTxns } from "../src/parse/month";
import { planSetup } from "../src/setup";
import { findAccounts, loadMonths } from "../src/vault/load";
import { fakeVault } from "./fakeVault";
import { CATS } from "./helpers";

const NOW = moment("2026-08-20");
const byName = (files: { path: string; content: string }[], end: string) =>
  files.find((f) => f.path.endsWith(end))!.content;

describe("planSetup", () => {
  it("creates the inbox, the config and the three pages", () => {
    const all = planSetup("Money", new Set(), NOW, false);
    expect(all.map((f) => f.path).sort()).toEqual([
      "Money/Expenses.md", "Money/Money Accounts Config.md", "Money/Money Accounts.md",
      "Money/Money Dashboard.md", "Money/Money Map.md",
    ]);
    expect(parseInbox(byName(all, "Expenses.md"))).toEqual([]);
    expect(byName(all, "Money Dashboard.md")).toContain("```money-dashboard");
    expect(parseAccounts(byName(all, "Money Accounts Config.md")).length).toBeGreaterThan(0);
  });
  it("never overwrites a note that exists", () => {
    const all = planSetup("Money", new Set(), NOW, true);
    expect(planSetup("Money", new Set(all.map((f) => f.path)), NOW, true)).toEqual([]);
    const some = planSetup("Money", new Set(["Money/Expenses.md"]), NOW, true);
    expect(some.find((f) => f.path === "Money/Expenses.md")).toBeUndefined();
  });
  it("adds sample rows this month and a sample archived month", () => {
    const all = planSetup("", new Set(), NOW, true);
    expect(all.map((f) => f.path)).toContain("2026 - 07-July.md");
    const rows = parseInbox(byName(all, "Expenses.md"));
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r) => r.key === "2026-08")).toBe(true);
    expect(parseMonthTxns(byName(all, "2026 - 07-July.md"))!.length).toBeGreaterThan(3);
  });
  it("produces notes the loaders can read end to end", async () => {
    const all = planSetup("Money", new Set(), NOW, true);
    const v = fakeVault(Object.fromEntries(all.map((f) => [f.path, f.content])),
      { "Money/2026 - 07-July.md": { money: { status: "sample" } } });
    const res = await loadMonths(v, CATS, NOW);
    expect(res.months.map((m) => m.key)).toEqual(["2026-07", "2026-08"]);
    expect(res.months[1].net).toBeGreaterThan(0);
    expect((await findAccounts(v))!.file.path).toBe("Money/Money Accounts Config.md");
  });
});
