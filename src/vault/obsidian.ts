import { App, TFile } from "obsidian";
import type { FileLike, VaultLike } from "./types";

/** The real vault behind the loaders. */
export const obsidianVault = (app: App): VaultLike => ({
  files: () => app.vault.getMarkdownFiles(),
  read: (f: FileLike) => (f instanceof TFile ? app.vault.cachedRead(f) : Promise.resolve("")),
  frontmatter: (f: FileLike) => (f instanceof TFile ? app.metadataCache.getFileCache(f)?.frontmatter ?? null : null),
});
