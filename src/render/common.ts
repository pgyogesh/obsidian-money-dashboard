import { App, TFile } from "obsidian";
import type { Formatter } from "../parse/format";
import { locParts } from "../parse/location";
import type { Categories, InboxRow, Ranked } from "../parse/types";
import { replaceCell, type EditResult } from "../write/cell";
import type { MoneySettings } from "../settings";

/** What every page renderer gets. */
export interface RenderCtx {
  app: App;
  settings: MoneySettings;
  fmt: Formatter;
  cats: Categories;
  /** Survives a re-render, so a page keeps its month, cycle or map view. */
  state: Record<string, unknown>;
  /** Re-read the vault and draw again. */
  refresh(): Promise<void>;
  /** Run when the page is re-rendered or closed. */
  onCleanup(cb: () => void): void;
  /** Re-render when this note changes. */
  watch(path: string | null | undefined): void;
  /** Open the archive preview. */
  openArchive(): void;
  /** Open the add-expense form. */
  openEntry(): void;
}

// --- Colours -----------------------------------------------------------------
// Hashed, not ranked, so a name keeps its colour from month to month even when
// its rank moves. The --md-dash-* tokens follow the theme where it defines
// --nt-dash-*, and fall back to fixed hues.
const DASH_FALLBACK = ["#2383e2", "#9a6dd7", "#2d9964", "#d9730d", "#4aa3b8", "#d75f96", "#7a7a85"];
const hash = (s: string) => {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
};
export const colorFor = (name: string): string => {
  const i = hash(name) % DASH_FALLBACK.length;
  return `var(--md-dash-${i + 1}, ${DASH_FALLBACK[i]})`;
};
export const catSlug = (name: string): string => String(name ?? "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** A category has its own colour in styles.css. The hash covers any other. */
export const colorForCategory = (name: string): string => `var(--md-cat-${catSlug(name)}, ${colorFor(name)})`;

// --- Building blocks ---------------------------------------------------------
export type Panel = HTMLDivElement & { head: HTMLDivElement };

export const panel = (parent: HTMLElement, title: string, sub: string | null, cls = ""): Panel => {
  const p = parent.createDiv({ cls: `wd-money-panel ${cls}`.trim() }) as Panel;
  const h = p.createDiv({ cls: "wd-money-panel-head" });
  h.createSpan({ cls: "wd-money-panel-title", text: title });
  if (sub) h.createSpan({ cls: "wd-money-panel-sub", text: sub });
  p.head = h;
  return p;
};

/** Horizontal bars, scaled to the largest row so a long tail stays visible. */
export const bars = (
  parent: HTMLElement, rows: Ranked, total: number, fmt: Formatter,
  opts: { colour?: (n: string) => string; pretty?: (n: string) => string; empty?: string } = {},
) => {
  const box = parent.createDiv({ cls: "wd-money-bars" });
  if (!rows.length) { box.createDiv({ cls: "wd-money-panel-sub", text: opts.empty ?? "Nothing recorded." }); return; }
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)));
  for (const [name, value] of rows) {
    const row = box.createDiv({ cls: "wd-money-row" });
    row.setCssProps({
      "--bar-color": (opts.colour ?? colorFor)(name),
      "--bar-width": `${max > 0 ? (Math.abs(value) / max) * 100 : 0}%`,
    });
    row.createDiv({ cls: "wd-money-name", text: opts.pretty ? opts.pretty(name) : name, attr: { title: name } });
    row.createDiv({ cls: "wd-money-track" }).createDiv({ cls: "wd-money-fill" });
    const amt = row.createDiv({ cls: "wd-money-amt", text: fmt.whole(value), attr: { title: fmt.exact(value) } });
    amt.createSpan({ cls: "wd-money-pct", text: fmt.pct(Math.abs(value), total) });
  }
};

/** One location cell, drawn the same way in every table. */
export const locCell = (tr: HTMLTableRowElement, value: string, cls = "") => {
  const td = tr.createEl("td", { cls: `is-loc ${cls}`.trim() });
  const p = locParts(value);
  if (!p) return td;
  if (p.url) {
    td.createEl("a", {
      cls: "wd-money-loc", text: p.label, href: p.url,
      attr: { title: `Open ${p.label} in Maps`, target: "_blank", rel: "noopener" },
    });
  } else {
    td.setText(p.label);
    td.setAttr("title", p.label);
  }
  return td;
};

export const statCards = (parent: HTMLElement, cards: { cls: string; label: string; value: string; detail: string; detailCls?: string }[]) => {
  const grid = parent.createDiv({ cls: "wd-grid" });
  for (const c of cards) {
    const el = grid.createDiv({ cls: `wd-card ${c.cls}` });
    el.createDiv({ cls: "wd-label", text: c.label });
    el.createDiv({ cls: "wd-value", text: c.value });
    el.createDiv({ cls: `wd-detail ${c.detailCls ?? ""}`.trim(), text: c.detail });
  }
  return grid;
};

/** A link that opens a note. */
export const noteLink = (app: App, parent: HTMLElement, text: string, path: string, cls = "wd-money-link") => {
  const a = parent.createEl("a", { cls, text, href: "#" });
  a.onclick = (ev) => { ev.preventDefault(); app.workspace.openLinkText(path, "", false); };
  return a;
};

// Every method the capture prompt allows needs a label, or it shows as the
// raw token.
export const METHOD_LABEL: Record<string, string> = {
  credit_card: "Credit card", debit_card: "Debit card", upi: "UPI",
  netbanking: "Net banking", neft: "NEFT", imps: "IMPS", atm: "ATM",
  fastag: "Fastag", cash: "Cash", unknown: "Unknown",
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// --- Writing ------------------------------------------------------------------
/**
 * Write one cell of an inbox row. `vault.process` hands over the file as it is
 * on disk right now, so a row the Shortcut appended since the page rendered
 * is never lost.
 */
export const writeCell = async (app: App, path: string, row: InboxRow, cellIndex: number, value: string): Promise<EditResult> => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return { ok: false, why: "the inbox file is not available" };
  let result: EditResult = { ok: false, why: "nothing was written" };
  await app.vault.process(file, (data) => {
    result = replaceCell(data, row, cellIndex, value);
    return result.ok ? result.text : data;
  });
  return result;
};

/** True while the user is typing or choosing in one of this block's fields. */
export const isEditing = (block: HTMLElement, active: Element | null): boolean =>
  !!active && block.contains(active) && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName);
