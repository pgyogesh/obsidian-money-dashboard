// @vitest-environment jsdom
import moment from "moment";
import { beforeAll, describe, expect, it } from "vitest";
import { makeFormat } from "../src/parse/format";
import { renderAccounts } from "../src/render/accounts";
import type { RenderCtx } from "../src/render/common";
import { renderDashboard } from "../src/render/dashboard";
import { renderMap } from "../src/render/map";
import { DEFAULT_SETTINGS } from "../src/settings";
import { planSetup } from "../src/setup";
import { installDomHelpers } from "./dom";
import { fakeApp as makeFakeApp } from "./fakeApp";

// The sample July note is marked as sample data in its own frontmatter.
const fakeApp = (files: Record<string, string>) => {
  const f = makeFakeApp(files);
  for (const p of Object.keys(files)) if (/status: sample/.test(files[p])) f.fm[p] = { money: { status: "sample" } };
  return f;
};

const calls: string[] = [];
const ctxFor = (app: unknown, redraw: () => Promise<void> = async () => {}): RenderCtx => ({
  openArchive: () => { calls.push("archive"); },
  openEntry: () => { calls.push("entry"); },
  app: app as never,
  settings: DEFAULT_SETTINGS,
  fmt: makeFormat({ currency: "₹", style: "indian" }),
  cats: { income: "Income", transfer: "Transfer", investments: "Investments" },
  state: {},
  refresh: redraw,
  onCleanup: () => {},
  watch: () => {},
});

const sample = () => Object.fromEntries(planSetup("Money", new Set(), moment(), true).map((f) => [f.path, f.content]));

beforeAll(() => { installDomHelpers(); (globalThis as any).requestAnimationFrame = () => 0; (globalThis as any).cancelAnimationFrame = () => {}; });

describe("renderDashboard", () => {
  it("draws the current month from the sample notes", async () => {
    const { app } = fakeApp(sample());
    const el = document.createElement("div");
    await renderDashboard(ctxFor(app), el);
    expect(el.querySelector(".wd-money-title")!.textContent).toBe(moment().format("MMMM YYYY"));
    expect(el.querySelectorAll(".wd-card").length).toBe(7);
    expect(el.textContent).toContain("row needs a category");
    expect(el.querySelectorAll("table.wd-money-table tbody tr").length).toBeGreaterThan(5);
  });

  it("writes a category into the inbox from the picker", async () => {
    const { app, store } = fakeApp(sample());
    const el = document.createElement("div");
    let redraws = 0;
    await renderDashboard(ctxFor(app, async () => { redraws++; }), el);
    const pick = el.querySelector("select.wd-cat-select.is-empty") as HTMLSelectElement;
    pick.value = "Groceries";
    await (pick.onchange as () => Promise<void>)();
    expect(redraws).toBe(1);
    expect(store["Money/Expenses.md"]).toMatch(/\| City Cafe \| Groceries \|/);
  });

  it("switches to the previous month and marks it as sample data", async () => {
    const { app } = fakeApp(sample());
    const el = document.createElement("div");
    const ctx = ctxFor(app);
    await renderDashboard(ctx, el);
    (el.querySelector('button[aria-label="Previous month"]') as HTMLButtonElement).click();
    expect(el.textContent).toContain("is sample data");
    expect(ctx.state.selKey).toBe(moment().subtract(1, "month").format("YYYY-MM"));
  });

  it("shows the empty state in an empty vault", async () => {
    const { app } = fakeApp({ "a.md": "hello" });
    const el = document.createElement("div");
    await renderDashboard(ctxFor(app), el);
    expect(el.textContent).toContain("No money data found yet");
  });
});

describe("dashboard buttons", () => {
  it("has an add button in the header that opens the entry form", async () => {
    const { app } = fakeApp(sample());
    const el = document.createElement("div");
    await renderDashboard(ctxFor(app), el);
    calls.length = 0;
    (el.querySelector('button[aria-label="Add an expense"]') as HTMLButtonElement).click();
    expect(calls).toEqual(["entry"]);
  });
  it("puts an Archive button on the unarchived banner", async () => {
    const files = sample();
    // Move the sample rows into last month, so the month has ended but is still in the inbox.
    const last = moment().subtract(1, "month").format("YYYY-MM");
    files["Money/Expenses.md"] = files["Money/Expenses.md"].replace(new RegExp(moment().format("YYYY-MM"), "g"), last);
    delete files[`Money/${moment().subtract(1, "month").format("YYYY - MM-MMMM")}.md`];
    const { app } = fakeApp(files);
    const el = document.createElement("div");
    await renderDashboard(ctxFor(app), el);
    calls.length = 0;
    const btn = el.querySelector(".wd-money-warn button.wd-money-warn-action") as HTMLButtonElement;
    expect(btn.textContent).toBe("Archive…");
    btn.click();
    expect(calls).toEqual(["archive"]);
  });
});

describe("renderAccounts", () => {
  it("draws one card per configured account", async () => {
    const { app } = fakeApp(sample());
    const el = document.createElement("div");
    await renderAccounts(ctxFor(app), el);
    const labels = [...el.querySelectorAll(".wd-grid")[0].querySelectorAll(".wd-label")].map((n) => n.textContent);
    expect(labels.sort()).toEqual(["Everyday Bank", "Shopping Card", "Travel Card"]);
  });
});

describe("renderAccounts, account case", () => {
  it("counts rows whose Account differs from the config only in case", async () => {
    const files = sample();
    files["Money/Expenses.md"] = files["Money/Expenses.md"].replace(/\| Travel Card \|/g, "| travel card |");
    const { app } = fakeApp(files);
    const el = document.createElement("div");
    await renderAccounts(ctxFor(app), el);
    const card = [...el.querySelectorAll(".wd-grid")[0].querySelectorAll(".wd-card")]
      .find((c) => c.querySelector(".wd-label")!.textContent === "Travel Card")!;
    // Sample rows fall on days 3 to 7, so they sit in the current cycle up to
    // the 18th and in the last bill after it.
    const counted = card.querySelector(".wd-value")!.textContent !== "₹0" || /Last bill/.test(card.textContent ?? "");
    expect(counted).toBe(true);
  });
});

describe("renderMap", () => {
  it("draws the map shell and the places table", async () => {
    const { app } = fakeApp(sample());
    const el = document.createElement("div");
    await renderMap(ctxFor(app), el);
    expect(el.querySelector(".wd-hmap")).not.toBeNull();
    expect(el.querySelector(".wd-hmap-legend-sum")!.textContent).toMatch(/places?/);
  });
});
