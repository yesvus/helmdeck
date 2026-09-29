// SPDX-License-Identifier: MIT
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * These mirror the `exports` map in package.json, one entry per documented entry point.
 *
 * A single string alias is a prefix replacement, so the one entry that used to be here turned
 * `@yesvus/helmdeck/baseline` into `src/index.ts/baseline`, a file that does not exist. Nothing
 * imported the subpath, so the documented entry point was broken in the only place that resolves
 * the package by name. Anchored patterns cannot overrun into each other.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@yesvus\/helmdeck$/, replacement: entry("./src/index.ts") },
      { find: /^@yesvus\/helmdeck\/baseline$/, replacement: entry("./src/baseline.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    setupFiles: ["./tests/setup.ts"],
    maxWorkers: 4,
  },
});
