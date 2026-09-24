import { App, Modal, Notice } from "obsidian";
import type { Formatter } from "../parse/format";
import type { Categories } from "../parse/types";
import type { ArchivePlan } from "./plan";
import { previewArchive, runArchive, type ArchiveOptions } from "./run";

/**
 * The preview: what archiving would do, month by month. Nothing is written
 * until Archive is pressed, and Archive then plans again from a fresh read.
 */
export class ArchiveModal extends Modal {
  constructor(app: App, private opts: ArchiveOptions, private cats: Categories, private fmt: Formatter) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.titleEl.setText("Archive completed months");
    this.contentEl.addClass("md-modal");
    this.contentEl.createDiv({ cls: "md-modal-note", text: "Reading the inbox…" });
    const { plan, inboxPath } = await previewArchive(this.app, this.opts, this.cats);
    this.draw(plan, inboxPath);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private draw(plan: ArchivePlan | null, inboxPath: string | null): void {
    const c = this.contentEl;
    c.empty();
    if (!plan || !inboxPath) {
      c.createDiv({ cls: "md-modal-problem", text: "No inbox found. Run \"Money Dashboard: Set up money notes\" first." });
      return;
    }
    const f = this.fmt;
    c.createDiv({
      cls: "md-modal-note",
      text: `Inbox: ${inboxPath}. ${plan.currentCount} row${plan.currentCount === 1 ? "" : "s"} from the current month stay there.`,
    });

    for (const m of plan.months) {
      const box = c.createDiv({ cls: "md-modal-month" });
      box.createDiv({ cls: "md-modal-month-title", text: m.label });
      box.createDiv({ cls: "md-modal-path", text: `${m.isNew ? "New note" : "Existing note"}: ${m.path}` });
      const bits = [
        `${m.moved.length} row${m.moved.length === 1 ? "" : "s"} moved`,
        `${m.merged.length} in total after merging`,
      ];
      if (m.dropped) bits.push(`${m.dropped} duplicate${m.dropped === 1 ? "" : "s"} dropped`);
      if (m.renamed) bits.push(`${m.renamed} merchant spelling${m.renamed === 1 ? "" : "s"} unified`);
      box.createDiv({ text: bits.join(" · ") });
      box.createDiv({
        cls: "md-modal-figures",
        text: `Spend ${f.exact(m.summary.spend)} · refunds ${f.exact(m.summary.refunds)} · net ${f.exact(m.summary.net)} · income ${f.exact(m.summary.income)}`,
      });
    }

    if (plan.blank.length) {
      const list = c.createDiv({ cls: "md-modal-problem" });
      list.createDiv({ text: "These rows need a category first:" });
      const ul = list.createEl("ul");
      for (const r of plan.blank) ul.createEl("li", { text: `${r.when}  ${r.merchant}  ${f.exact(r.amount)}` });
    }
    if (plan.future.length) {
      c.createDiv({ cls: "md-modal-note", text: `${plan.future.length} row${plan.future.length === 1 ? " is" : "s are"} dated in the future and will stay in the inbox.` });
    }
    if (plan.unreadable) {
      c.createDiv({ cls: "md-modal-note", text: `${plan.unreadable} inbox line${plan.unreadable === 1 ? " has" : "s have"} no readable date and will stay in the inbox.` });
    }
    for (const why of plan.blocked) c.createDiv({ cls: "md-modal-problem", text: why });

    c.createDiv({ cls: "md-modal-note", text: "The inbox is backed up first. Your own text in a month note is kept: only its table and its money frontmatter change." });
    const row = c.createDiv({ cls: "md-modal-buttons" });
    row.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    const go = row.createEl("button", { cls: "mod-cta", text: "Archive" });
    go.disabled = plan.blocked.length > 0;
    go.onclick = async () => {
      go.disabled = true;
      go.setText("Archiving…");
      const res = await runArchive(this.app, this.opts, this.cats);
      if (res.ok) {
        new Notice(`Money Dashboard: archived ${res.months.join(", ")}. ${res.moved} row${res.moved === 1 ? "" : "s"} moved, ${res.left} left in the inbox. Backup: ${res.backup}`, 10000);
        this.close();
      } else {
        new Notice(`Money Dashboard: ${res.why}`, 12000);
        const again = await previewArchive(this.app, this.opts, this.cats);
        this.draw(again.plan, again.inboxPath);
      }
    };
  }
}
