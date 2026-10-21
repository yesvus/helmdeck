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
  // These store tests cover SQLite, not the server-only runtime marker.
  plugins: [{
    name: "independent-host-store-test-server-only-stub",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "next/cache" &&
        importer?.split("?")[0] === entry("./examples/independent-host/host/actions.ts")
      ) {
        return entry("./tests/next-cache.ts");
      }
      if (
        source === "server-only" &&
        [
          entry("./examples/independent-host/host/session-store.ts"),
          entry("./examples/independent-host/host/persistence.ts"),
        ].includes(importer?.split("?")[0] ?? "")
      ) {
        return entry("./tests/server-only.ts");
      }
    },
  }],
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
