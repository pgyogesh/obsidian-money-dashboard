// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { makeFormat } from "../src/parse/format";
import { renderBudgets } from "../src/render/budgets";
import type { RenderCtx } from "../src/render/common";
import { DEFAULT_SETTINGS } from "../src/settings";
import { installDomHelpers } from "./dom";

beforeAll(installDomHelpers);

const draw = (budgets: Record<string, number>, spending: [string, number][]) => {
  const el = document.createElement("div");
  renderBudgets({
    settings: { ...DEFAULT_SETTINGS, categoryBudgets: budgets },
    fmt: makeFormat({ currency: "$", style: "international" }),
    cats: { income: "Salary", transfer: "Transfers", investments: "Savings" },
  } as RenderCtx, el, spending);
  const rows = [...el.querySelectorAll<HTMLElement>(".wd-money-budget-row")];
  const fill = (row: number, kind: string) => rows[row].querySelector<HTMLElement>(`.is-${kind} .wd-money-budget-fill`)!;
  return { el, rows, fill };
};

describe("budget graph", () => {
  it("compares categories on a shared scale and keeps overspending visible", () => {
    const { el, rows, fill } = draw({ Groceries: 100, Shopping: 10 }, [["Groceries", 90], ["Shopping", 20]]);
    expect(el.querySelector("table")).toBeNull();
    expect(fill(0, "limit").style.getPropertyValue("--budget-width")).toBe("100%");
    expect(fill(0, "spend").style.getPropertyValue("--budget-width")).toBe("90%");
    expect(fill(1, "limit").style.getPropertyValue("--budget-width")).toBe("10%");
    expect(fill(1, "spend").style.getPropertyValue("--budget-width")).toBe("20%");
    expect(rows[1].classList.contains("is-over-budget")).toBe(true);
    expect(rows[1].getAttribute("aria-label")).toBe("Shopping: net spend $20.00, budget $10.00, $10.00 over");
    expect(el.querySelector('[role="list"]')).not.toBeNull();
  });

  it("extends the scale to the full spend when spending exceeds every budget", () => {
    const { fill } = draw({ Groceries: 100 }, [["Groceries", 200]]);
    expect(fill(0, "spend").style.getPropertyValue("--budget-width")).toBe("100%");
    expect(fill(0, "limit").style.getPropertyValue("--budget-width")).toBe("50%");
  });

  it("draws net refunds left of zero and keeps positive budgets to the right", () => {
    const { el, rows, fill } = draw({ Groceries: 100 }, [["Groceries", -25]]);
    expect(el.querySelector<HTMLElement>(".wd-money-budget-chart")!.style.getPropertyValue("--budget-zero")).toBe("20%");
    expect(fill(0, "spend").style.getPropertyValue("--budget-start")).toBe("0%");
    expect(fill(0, "spend").style.getPropertyValue("--budget-width")).toBe("20%");
    expect(fill(0, "limit").style.getPropertyValue("--budget-start")).toBe("20%");
    expect(fill(0, "limit").style.getPropertyValue("--budget-width")).toBe("80%");
    expect(rows[0].textContent).toContain("-$25.00");
    expect(rows[0].textContent).toContain("$125.00 left");
  });

  it("handles zero budgets and no spending without invalid widths or false bars", () => {
    const { el, fill } = draw({ Shopping: 0 }, []);
    expect(fill(0, "spend").style.getPropertyValue("--budget-width")).toBe("0%");
    expect(fill(0, "limit").style.getPropertyValue("--budget-width")).toBe("0%");
    expect(el.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(el.textContent).toContain("$0.00 left");
  });

  it("excludes customized non-spending categories and unbudgeted spending", () => {
    const { rows } = draw({ Groceries: 100, Salary: 2000, Transfers: 500, Savings: 400 }, [["Travel", 300]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Groceries");
    expect(rows[0].textContent).toContain("$0.00");
  });
});
