import type { FileLike, VaultLike } from "../src/vault/types";

export const fakeVault = (files: Record<string, string>, fm: Record<string, Record<string, unknown>> = {}): VaultLike & { reads: string[] } => {
  const list: FileLike[] = Object.keys(files).map((path) => ({
    path, basename: path.split("/").pop()!.replace(/\.md$/, ""),
  }));
  const reads: string[] = [];
  return {
    reads,
    files: () => list,
    read: async (f) => { reads.push(f.path); return files[f.path]; },
    frontmatter: (f) => fm[f.path] ?? null,
  };
};
