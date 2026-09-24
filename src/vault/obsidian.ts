import { App, TFile } from "obsidian";
import type { FileLike, VaultLike } from "./types";

/** The real vault behind the loaders. */
export const obsidianVault = (app: App): VaultLike => ({
  files: () => app.vault.getMarkdownFiles(),
  read: (f: FileLike) => app.vault.cachedRead(f as TFile),
  frontmatter: (f: FileLike) => app.metadataCache.getFileCache(f as TFile)?.frontmatter ?? null,
});
