// SPDX-License-Identifier: MIT

/**
 * The class-name inspection the modal and the sheet share, so a consumer's own width or placement
 * is recognised the same way in both.
 *
 * Tailwind variants carry digits ("2xl:"), brackets, and pseudo-classes ("[&:hover]:",
 * "min-[900px]:"), so splitting on the last colon is wrong and matching "[a-z]+:" silently
 * ignores every breakpoint from 2xl up. Take the segment after the final colon that sits
 * outside any brackets, which resolves all of those forms.
 */
export function utilityName(className: string): string {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (character === "[" || character === "(") depth += 1;
    else if (character === "]" || character === ")") depth -= 1;
    else if (character === ":" && depth === 0) start = index + 1;
  }
  return className.slice(start);
}

export function classUtilities(className?: string): string[] {
  return className?.split(/\s+/).map((name) => utilityName(name).replace(/^!/, "")) ?? [];
}

/**
 * A gutter class is a width and a max-w is not, so they answer separate questions. A max-w-only
 * consumer keeps the gutter. A w-only consumer needs an explicit bound instead, because with the
 * gutter gone nothing stops a fixed rem width from exceeding the viewport.
 */
export function hasWidthUtility(className?: string): boolean {
  return classUtilities(className).some((name) => /^w-/.test(name));
}

export function hasMaxWidthUtility(className?: string): boolean {
  return classUtilities(className).some((name) => /^max-w-/.test(name));
}

/**
 * A bare "inset-" places on both axes, but "inset-x-" only the horizontal and "inset-y-" only the
 * vertical. Without the exclusions each one suppressed the opposite axis's centring anchor too.
 */
export function hasHorizontalPlacement(className?: string): boolean {
  return classUtilities(className).some((name) =>
    /^-?(?:left|right|start|end|inset-x|inset-inline|inset(?!-(?:y|block)))-/.test(name),
  );
}

export function hasVerticalPlacement(className?: string): boolean {
  return classUtilities(className).some((name) =>
    /^-?(?:top|bottom|inset-y|inset-block|inset(?!-(?:x|inline)))-/.test(name),
  );
}
