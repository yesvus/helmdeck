// SPDX-License-Identifier: MIT
import { defineConfig } from "vitest/config";

// The live check is a separate project so the ordinary suite stays runnable with no database, which
// is how CI and a fresh clone work. Sharing the include pattern would mean either weakening it or
// carrying a skipped test that silently stops being run.
export default defineConfig({
  test: {
    include: ["checks/**/*.check.ts"],
  },
});
