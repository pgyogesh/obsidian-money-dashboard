import { defineConfig } from "vitest/config";
import path from "path";

// The plugin imports `moment` from "obsidian", which only exists inside the
// app. Tests point "obsidian" at a stub that re-exports the npm copy.
export default defineConfig({
  resolve: { alias: { obsidian: path.resolve(__dirname, "tests/obsidian-stub.ts") } },
  test: { include: ["tests/**/*.test.ts"] },
});
