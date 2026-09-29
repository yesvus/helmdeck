// SPDX-License-Identifier: MIT
/**
 * The tone vocabulary that AdminStatCard, AdminStatusPill and AdminBanner share.
 *
 * "danger" is the canonical severity word because the theme tokens, the Tailwind red scale those
 * tokens remap, and AdminPendingButton's tone already say danger. "error" stays in the union as an
 * accepted alias of the same tone so code written against it keeps compiling and renders the same
 * classes.
 */
export type AdminTone = "neutral" | "info" | "success" | "warning" | "danger" | "error";

/**
 * A component's tone map, built from the tones that stand alone plus the one class string both
 * severity spellings resolve to. The parameter names every non-severity tone, so adding a tone to
 * AdminTone without a class for it fails to compile at the call site rather than rendering that
 * tone unstyled.
 */
export function adminToneClasses(
  toneClasses: Record<Exclude<AdminTone, "danger" | "error">, string>,
  severityClassName: string,
): Record<AdminTone, string> {
  return { ...toneClasses, danger: severityClassName, error: severityClassName };
}
