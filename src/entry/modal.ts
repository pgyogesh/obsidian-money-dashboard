import { App, Modal, moment, Notice, Setting } from "obsidian";
import { collectMonthNotes } from "../archive/run";
import { TXN_START } from "../parse/markers";
import type { MoneySettings } from "../settings";
import { findAccounts, findInbox, loadPool } from "../vault/load";
import { obsidianVault } from "../vault/obsidian";
import { METHOD_LABEL } from "../render/common";
import { METHODS, singleFlight, validateEntry, type EntryFields } from "./row";
import { saveEntry } from "./save";

/** The add-expense form. It appends one row to the inbox. */
export class EntryModal extends Modal {
  private f: EntryFields;
  private archivedKeys = new Set<string>();
  private messages!: HTMLDivElement;
  private saveBtn!: HTMLButtonElement;

  constructor(app: App, private settings: MoneySettings, private onSaved: (f: EntryFields) => Promise<void>) {
    super(app);
    this.f = {
      when: moment().format("YYYY-MM-DD HH:mm"), amount: "", direction: "debit", merchant: "",
      category: "", account: settings.lastAccount, method: settings.lastMethod || "upi",
      description: "", ref: "", location: "",
    };
  }

  async onOpen(): Promise<void> {
    this.titleEl.setText("Add expense");
    const c = this.contentEl;
    c.addClass("md-modal");
    const v = obsidianVault(this.app);
    const [inbox, accounts, pool] = await Promise.all([findInbox(v), findAccounts(v), loadPool(v, moment())]);
    for (const [key, n] of await collectMonthNotes(this.app, inbox?.file.path ?? null)) {
      if (n.text.includes(TXN_START)) this.archivedKeys.add(key);
    }
    if (!inbox) {
      c.createDiv({ cls: "md-modal-problem", text: "No inbox found. Run \"Money Dashboard: Set up money notes\" first." });
      return;
    }

    new Setting(c).setName("When").addText((t) => {
      t.inputEl.type = "datetime-local";
      t.setValue(this.f.when.replace(" ", "T"));
      t.onChange((x) => { this.f.when = x.replace("T", " "); this.check(); });
    });
    new Setting(c).setName("Amount").addText((t) => {
      t.inputEl.type = "number";
      t.inputEl.min = "0";
      t.inputEl.step = "0.01";
      t.onChange((x) => { this.f.amount = x; this.check(); });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });
    new Setting(c).setName("Direction").addDropdown((d) => d
      .addOption("debit", "Money out (debit)").addOption("credit", "Money in (credit)")
      .setValue(this.f.direction).onChange((x) => { this.f.direction = x as EntryFields["direction"]; }));

    const listId = `md-entry-merchants-${Math.random().toString(36).slice(2, 8)}`;
    const names = [...new Set(pool.map((t) => t.merchant).filter((m) => m && m !== "Unknown"))].sort();
    const dl = c.createEl("datalist", { attr: { id: listId } });
    for (const n of names) dl.createEl("option", { value: n });
    new Setting(c).setName("Merchant").addText((t) => {
      t.inputEl.setAttr("list", listId);
      t.onChange((x) => { this.f.merchant = x; this.check(); });
    });

    new Setting(c).setName("Category").addDropdown((d) => {
      d.addOption("", "Decide later");
      for (const cat of this.settings.categories) d.addOption(cat, cat);
      d.setValue("").onChange((x) => { this.f.category = x; });
    });

    const acctNames = accounts?.accounts.map((a) => a.name) ?? [];
    new Setting(c).setName("Account").addText((t) => {
      if (acctNames.length) {
        const aid = `${listId}-acct`;
        const al = c.createEl("datalist", { attr: { id: aid } });
        for (const n of acctNames) al.createEl("option", { value: n });
        t.inputEl.setAttr("list", aid);
      }
      t.setValue(this.f.account).onChange((x) => { this.f.account = x; });
    });
    new Setting(c).setName("Method").addDropdown((d) => {
      for (const m of METHODS) d.addOption(m, METHOD_LABEL[m] ?? m);
      d.setValue(this.f.method).onChange((x) => { this.f.method = x; });
    });
    new Setting(c).setName("Description").setDesc("What it was for, in your own words.")
      .addText((t) => t.onChange((x) => { this.f.description = x; }));
    new Setting(c).setName("Ref").setDesc("Bank reference. Left empty, a MANUAL id is used, so it is never taken for a duplicate.")
      .addText((t) => t.onChange((x) => { this.f.ref = x; }));
    new Setting(c).setName("Location").setDesc("Optional. A Maps link, or \"lat, lng\".")
      .addText((t) => t.onChange((x) => { this.f.location = x; }));

    this.messages = c.createDiv({ cls: "md-modal-messages" });
    const row = c.createDiv({ cls: "md-modal-buttons" });
    row.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    this.saveBtn = row.createEl("button", { cls: "mod-cta", text: "Add" });
    const save = singleFlight(() => this.save());
    this.saveBtn.onclick = () => { void save(); };
    this.scope.register(["Mod"], "Enter", () => { void save(); return false; });
    this.check();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private check(): { errors: string[] } {
    const { errors, warnings } = validateEntry(this.f, moment(), this.archivedKeys);
    this.messages.empty();
    for (const w of warnings) this.messages.createDiv({ cls: "md-modal-note", text: w });
    if (this.f.amount || this.f.merchant) for (const e of errors) this.messages.createDiv({ cls: "md-modal-problem", text: e });
    this.saveBtn.disabled = errors.length > 0;
    return { errors };
  }

  private async save(): Promise<void> {
    if (this.check().errors.length) return;
    this.saveBtn.disabled = true;
    const res = await saveEntry(this.app, this.f);
    if (!res.ok) {
      new Notice(`Money Dashboard: ${res.why}`, 8000);
      this.saveBtn.disabled = false;
      return;
    }
    try { await this.onSaved(this.f); } catch (e) { console.error("Money Dashboard: could not remember the account and method", e); }
    new Notice(`Money Dashboard: added ${this.f.merchant} to ${res.path}.`);
    this.close();
  }
}
