import { normaliseBudgets } from "../parse/budget";
import { categoryKind } from "../parse/summary";
import type { Ranked } from "../parse/types";
import { colorForCategory, panel, type RenderCtx } from "./common";

export const renderBudgets = (ctx: RenderCtx, parent: HTMLElement, spending: Ranked): void => {
  const budgets = Object.entries(normaliseBudgets(ctx.settings.categoryBudgets))
    .filter(([name]) => categoryKind(name, ctx.cats) === "spend");
  if (!budgets.length) return;
  const byCategory = new Map(spending);
  const rows = budgets.map(([name, budget]) => ({ name, budget, spent: byCategory.get(name) ?? 0 }));
  const low = Math.min(0, ...rows.map((row) => row.spent));
  const high = Math.max(0, ...rows.flatMap((row) => [row.spent, row.budget]));
  const range = high - low || 1;
  const p = panel(parent, "Monthly spending budgets", "Net spend after refunds · current limits applied to this month", "wd-money-budgets");
  p.createDiv({ cls: "wd-money-budget-guide", text: "Compare net spend with your monthly limit. All bars use the same amount scale." });
  const chart = p.createDiv({ cls: "wd-money-budget-chart", attr: { role: "list", "aria-label": "Monthly category spending compared with budgets" } });
  chart.setCssProps({
    "--budget-zero": `${(-low / range) * 100}%`,
    "--budget-value-width": `${Math.max(10, ...rows.flatMap((row) => [ctx.fmt.exact(row.spent).length, ctx.fmt.exact(row.budget).length])) + 1}ch`,
  });
  for (const { name, budget, spent } of rows) {
    // Match displayed currency precision so floating-point sums at the limit
    // cannot produce a misleading "0.00 over" status.
    const remaining = Number((budget - spent).toFixed(2));
    const status = remaining < 0 ? `${ctx.fmt.exact(-remaining)} over` : `${ctx.fmt.exact(remaining)} left`;
    const row = chart.createDiv({ cls: `wd-money-budget-row${remaining < 0 ? " is-over-budget" : ""}`, attr: {
      role: "listitem", "aria-label": `${name}: net spend ${ctx.fmt.exact(spent)}, budget ${ctx.fmt.exact(budget)}, ${status}`,
    } });
    row.setCssProps({ "--bar-color": colorForCategory(name) });
    const head = row.createDiv({ cls: "wd-money-budget-head" });
    head.createSpan({ cls: "wd-money-budget-name", text: name });
    head.createSpan({ cls: "wd-money-budget-status", text: status });
    for (const [kind, label, value] of [["spend", "Net spend", spent], ["limit", "Budget", budget]] as const) {
      const measure = row.createDiv({ cls: `wd-money-budget-measure is-${kind}` });
      measure.createSpan({ cls: "wd-money-budget-label", text: label });
      const track = measure.createDiv({ cls: "wd-money-budget-track", attr: { "aria-hidden": "true" } });
      track.createDiv({ cls: "wd-money-budget-fill" }).setCssProps({
        "--budget-start": `${((Math.min(value, 0) - low) / range) * 100}%`,
        "--budget-width": `${(Math.abs(value) / range) * 100}%`,
      });
      measure.createSpan({ cls: "wd-money-budget-value", text: ctx.fmt.exact(value) });
    }
  }
};
