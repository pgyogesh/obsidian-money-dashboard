import { App, Modal } from "obsidian";

/** A yes/no question in an Obsidian modal, not a browser dialog. */
export const confirmModal = (app: App, text: string, yes = "Delete", title = "Delete row"): Promise<boolean> =>
  new Promise((resolve) => {
    let answered = false;
    const m = new Modal(app);
    m.titleEl.setText(title);
    m.contentEl.createEl("p", { text });
    const row = m.contentEl.createDiv({ cls: "md-modal-buttons" });
    row.createEl("button", { text: "Cancel" }).onclick = () => m.close();
    const go = row.createEl("button", { cls: "mod-warning", text: yes });
    go.onclick = () => { answered = true; resolve(true); m.close(); };
    m.onClose = () => { m.contentEl.empty(); if (!answered) resolve(false); };
    m.open();
  });
