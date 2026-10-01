import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "fixtures/.next/**", "fixtures/next-env.d.ts", "examples/independent-host/.next/**", "examples/independent-host/next-env.d.ts", "template/.next/**", "template/next-env.d.ts", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The gate scripts under `scripts/` are Node programs, and without this every `console` and
    // `process` in them is an undefined identifier. A script whose whole job is to report a failure
    // cannot be linted with the browser's rules.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Payload's migrations. Payload generates each file's signature as
    // `({ db, payload, req })` whether or not the body uses the last two, and its migrate loader calls
    // `up` and `down` with that exact argument object, so a rename to `_payload` would be a lie about
    // what the function receives. The unused-parameter rule is off here for the same reason.
    files: ["fixtures/payload-migrations/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // The Node-side modules: the typecheck gate, the database URL, and the command that creates an
    // account. Without this they lint as files in no environment at all, which is what `process` and
    // `console` being undefined means.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
