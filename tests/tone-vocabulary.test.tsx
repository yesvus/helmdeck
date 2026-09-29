// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { Activity } from "lucide-react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { AdminBanner, AdminStatCard } from "../src/primitives/layout";
import { AdminStatusPill } from "../src/primitives/status-pill";
import type { AdminBannerTone, AdminStatCardTone } from "../src/primitives/layout";
import type { AdminTone } from "../src/primitives/tone";

/**
 * The three tone types were separate unions that disagreed on coverage: only AdminStatCardTone
 * accepted "danger", only AdminStatusTone and AdminStatCardTone had "neutral", and AdminBannerTone
 * had neither. A host that writes one tone helper could not hand the result to more than one
 * component, so the helper was duplicated per component or typed as a cast.
 *
 * TypeScript erases types at runtime, so `expect(typeof x)` cannot see a union. Assigning a value
 * to the type is a compile-time fact, and the only way a test can observe it is to run the
 * compiler. The check below type-checks real source text with the same compiler and options the
 * package ships, and fails on any error the union narrowing would produce.
 */
function typeErrorsIn(source: string, fileName = "tone-vocabulary.host.ts"): string[] {
  const cached = checked.get(source);
  if (cached) return cached;

  // The checker program is built from the real compiler options rather than a hand-written subset,
  // so strictness and module resolution match what `pnpm typecheck` applies to the package.
  const parsed = ts.parseJsonConfigFileContent(
    JSON.parse(readFileSync(join(process.cwd(), "tsconfig.test.json"), "utf8")),
    ts.sys,
    process.cwd(),
  );
  const options = {
    ...parsed.options,
    noEmit: true,
    types: ["vitest/globals", "@testing-library/jest-dom"],
  };
  const file = join(process.cwd(), "tests", fileName);
  // The script kind has to follow the extension, or a snippet containing JSX is parsed as plain
  // TypeScript and every element reports a syntax error instead of a type error.
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

  // A virtual file: the snippet has to live inside tests/ for its relative imports to resolve
  // against src/ the same way a test file's do, and it must not be written to disk.
  const host = ts.createCompilerHost(options);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (candidate) => candidate === file || fileExists(candidate);
  host.readFile = (candidate) => (candidate === file ? source : readFile(candidate));
  host.getSourceFile = (candidate, languageVersion, onError, shouldCreate) =>
    candidate === file
      ? ts.createSourceFile(candidate, source, languageVersion, true, scriptKind)
      : getSourceFile(candidate, languageVersion, onError, shouldCreate);

  const program = ts.createProgram([file], options, host);
  const messages = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === file)
    .map((diagnostic) => {
      const { line } = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return `${fileName}:${line + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
    });

  checked.set(source, messages);
  return messages;
}

// Building a program pulls in the whole src/ tree, which is a couple of seconds. The negative cases
// re-check a snippet they already have, so results are keyed by source text.
const checked = new Map<string, string[]>();

const ACCEPTED_TONES: AdminTone[] = ["neutral", "info", "success", "warning", "danger", "error"];

describe("the shared tone vocabulary", () => {
  it("accepts every tone value on each of the three tone types", () => {
    // The helper is annotated AdminTone, the union the host should write against, and its result is
    // assigned to all three published names. No cast appears anywhere: if the unions still differed
    // in coverage, at least one of these assignments is an error and this fails.
    const source = `
      import type { AdminBannerTone, AdminStatCardTone } from "../src/primitives/layout";
      import type { AdminStatusTone } from "../src/primitives/status-pill";
      import type { AdminTone } from "../src/primitives/tone";

      const tones: AdminTone[] = ${JSON.stringify(ACCEPTED_TONES)};
      export function toneFor(severity: "danger" | "error"): AdminTone {
        return severity;
      }
      const one: AdminTone = toneFor("danger");
      const two: AdminStatCardTone = toneFor("danger");
      const three: AdminStatusTone = toneFor("danger");
      const four: AdminBannerTone = toneFor("danger");
      const five: AdminStatCardTone = "info";
      const six: AdminStatusTone = "info";
      const seven: AdminBannerTone = "info";
      const eight: AdminStatCardTone = "neutral";
      const nine: AdminStatusTone = "neutral";
      const ten: AdminBannerTone = "neutral";
      const eleven: AdminStatCardTone = "success";
      const twelve: AdminStatusTone = "success";
      const thirteen: AdminBannerTone = "success";
      const fourteen: AdminStatCardTone = "warning";
      const fifteen: AdminStatusTone = "warning";
      const sixteen: AdminBannerTone = "warning";
      const seventeen: AdminStatCardTone = "error";
      const eighteen: AdminStatusTone = "error";
      const nineteen: AdminBannerTone = "error";
      export const used = [tones, one, two, three, four, five, six, seven, eight, nine, ten,
        eleven, twelve, thirteen, fourteen, fifteen, sixteen, seventeen, eighteen, nineteen];
    `;

    expect(typeErrorsIn(source)).toEqual([]);
  });

  it("accepts both severity spellings on the tone props of the components that take them", () => {
    // The types agreeing is not sufficient on its own: a host writes tone="danger" on the JSX
    // element, and the prop has to accept the value there too.
    const source = `
      import { AdminBanner, AdminStatCard } from "../src/primitives/layout";
      import { AdminStatusPill } from "../src/primitives/status-pill";
      import { Activity } from "lucide-react";

      export const danger = [
        <AdminStatCard key="a" icon={Activity} label="Errors" value="3" detail="Last hour" tone="danger" />,
        <AdminStatusPill key="b" tone="danger" label="Failed" />,
        <AdminBanner key="c" tone="danger" title="Failed" body="Save rejected" />,
      ];
      export const errors = [
        <AdminStatCard key="a" icon={Activity} label="Errors" value="3" detail="Last hour" tone="error" />,
        <AdminStatusPill key="b" tone="error" label="Failed" />,
        <AdminBanner key="c" tone="error" title="Failed" body="Save rejected" />,
      ];
    `;

    expect(typeErrorsIn(source, "tone-vocabulary.host.tsx")).toEqual([]);
  });

  it("rejects a tone outside the vocabulary, so the checker is not passing vacuously", () => {
    // Without this, a checker whose compiler options stopped matching the package's would report no
    // errors for any snippet and the two tests above would pass forever.
    const source = `
      import type { AdminStatusTone } from "../src/primitives/status-pill";
      export const bad: AdminStatusTone = "critical";
    `;

    expect(typeErrorsIn(source)).toHaveLength(1);
    expect(typeErrorsIn(source)[0]).toContain("critical");
  });

  it("makes the three published names the same type, in both assignment directions", () => {
    // One-directional assignability would be enough for the helper case above and would still hide
    // the three drifting apart, because a host may equally pass a tone from a component prop into
    // its own AdminTone-typed helper. The Equals trick is a compile-time identity assertion: it
    // resolves to false the moment either side has a member the other lacks.
    const source = `
      import type { AdminBannerTone, AdminStatCardTone } from "../src/primitives/layout";
      import type { AdminStatusTone } from "../src/primitives/status-pill";
      import type { AdminTone } from "../src/primitives/tone";

      type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      type Assert<T extends true> = T;

      export type SameVocabulary = Assert<
        Equals<AdminTone, AdminStatCardTone> &
        Equals<AdminTone, AdminStatusTone> &
        Equals<AdminTone, AdminBannerTone> &
        Equals<AdminStatCardTone, AdminStatusTone> &
        Equals<AdminStatCardTone, AdminBannerTone> &
        Equals<AdminStatusTone, AdminBannerTone>
      >;
    `;

    expect(typeErrorsIn(source)).toEqual([]);
  });

  it("names exactly the six tones of the shared vocabulary, no more and no fewer", () => {
    // An open-ended union, or one that quietly grew a member, would satisfy every assignment above
    // while leaving a host unable to switch exhaustively. Reading the members out of the source is
    // the only way a test can see a type that is not assignable to anything concrete.
    const source = readFileSync(join(process.cwd(), "src/primitives/tone.ts"), "utf8");
    const declaration = source.match(/export type AdminTone =([^;]+);/)?.[1] ?? "";
    const members = [...declaration.matchAll(/"([a-z]+)"/g)].map((match) => match[1]);

    // Sorted on both sides: the check is about which tones are in the union, not the order they
    // happen to be written in.
    expect(members.sort()).toEqual([...ACCEPTED_TONES].sort());
  });

  it("keeps every value the three types accepted before the merge", () => {
    // A merge that dropped a value would still satisfy the assignments above, and only a host
    // would find out. These are the exact members each type carried on main, asserted against the
    // merged union so a narrowing is a failure here rather than a break for a consumer.
    const beforeMerge: Record<"AdminStatCardTone" | "AdminStatusTone" | "AdminBannerTone", string[]> = {
      AdminStatCardTone: ["neutral", "success", "warning", "error", "danger"],
      AdminStatusTone: ["success", "warning", "error", "info", "neutral"],
      AdminBannerTone: ["info", "success", "warning", "error"],
    };

    for (const [name, values] of Object.entries(beforeMerge)) {
      const source = `
        import type { ${name} } from "../src/primitives/${name === "AdminStatCardTone" || name === "AdminBannerTone" ? "layout" : "status-pill"}";
        const value: ${name} = "error";
        const toneFor = (): ${name} => value;
        const used: ${name}[] = [toneFor(), ${values
          .filter((value) => value !== "error")
          .map((value) => `"${value}"`)
          .join(", ")}];
        export default used;
      `;
      expect(typeErrorsIn(source, `tone-vocabulary.${name}.ts`), name).toEqual([]);
    }
    // Each of the three calls above starts a TypeScript compiler, which is seconds of work rather
    // than milliseconds, and three of them in sequence do not fit in the default budget once the
    // rest of the suite is competing for the machine. The failure this budget was added for looked
    // like a broken assertion rather than a slow one, and it passed in isolation every time.
  }, 120_000);
});

describe("the documented tone vocabulary", () => {
  it("names the canonical spelling, so a host reads it before a compiler error does", () => {
    // The README is what a host consults when tone="danger" fails to compile, so the sentence has to
    // carry the answer on its own rather than pointing at a table the reader has to interpret.
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const section = readme.match(/^## Tone vocabulary\n([\s\S]*?)\n## /m)?.[1] ?? "";

    expect(section, "a Tone vocabulary section the reader can find").not.toBe("");
    const [lead] = section.split("\n\n");
    expect(lead).toContain("`danger` is the canonical spelling");
    expect(lead).toContain("`error` is still accepted");
    expect(lead).toContain("AdminBanner");
  });

  it("documents every type name a host needs to type a shared helper", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    // A union documented without the name to annotate leaves the host with nothing to import.
    for (const name of ["AdminTone", "AdminStatCardTone", "AdminStatusTone", "AdminBannerTone"]) {
      expect(readme, name).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe("danger and error render the same thing", () => {
  it("gives the status pill identical classes for both spellings", () => {
    const { container: danger } = render(<AdminStatusPill tone="danger" label="Failed" />);
    const { container: error } = render(<AdminStatusPill tone="error" label="Failed" />);

    // data-tone is the caller's spelling, so it is the one thing allowed to differ. The class list
    // is the rendered appearance, and an alias that drifted to a different red would show here.
    expect(danger.firstElementChild?.className).toBe(error.firstElementChild?.className);
    expect(danger.firstElementChild).toHaveClass("bg-red-100", "text-red-800");
    expect(danger.firstElementChild).toHaveAttribute("data-tone", "danger");
    expect(error.firstElementChild).toHaveAttribute("data-tone", "error");
  });

  it("gives the stat card identical classes for both spellings", () => {
    const toneOf = (tone: AdminStatCardTone) => {
      const { container } = render(
        <AdminStatCard icon={Activity} label="Errors" value="3" detail="Last hour" tone={tone} />,
      );
      // The tone paints the icon container, the first descendant of the card root.
      return container.querySelector(".rounded-admin-control")?.className;
    };

    expect(toneOf("danger")).toBe(toneOf("error"));
    expect(toneOf("danger")).toContain("bg-red-50");
  });

  it("gives the banner identical classes for both spellings", () => {
    const toneOf = (tone: AdminBannerTone) => {
      const { container } = render(<AdminBanner tone={tone} title="Failed" body="Save rejected" />);
      return container.firstElementChild?.className;
    };

    expect(toneOf("danger")).toBe(toneOf("error"));
    expect(toneOf("danger")).toContain("border-red-200");
  });

  it("resolves the severity alias from one class string, so the two cannot diverge in source", () => {
    // Rendering equality is checked above. This is the structural half: the maps are built by one
    // function that is handed a single severity class, so a second spelling cannot be added with
    // its own colour without the signature changing.
    const source = readFileSync(join(process.cwd(), "src/primitives/tone.ts"), "utf8");
    const buildSites = ["layout.tsx", "status-pill.tsx"].map((file) =>
      readFileSync(join(process.cwd(), "src/primitives", file), "utf8"),
    );

    expect(source).toContain("danger: severityClassName, error: severityClassName");
    for (const [index, file] of buildSites.entries()) {
      expect(file, `primitives/${["layout.tsx", "status-pill.tsx"][index]}`).toContain("adminToneClasses(");
      // A severity key spelled out at the call site would bypass the single class string.
      expect(file).not.toMatch(/^\s*(danger|error):/m);
    }
  });
});
