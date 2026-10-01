// SPDX-License-Identifier: MIT

import { LandingPageEditor } from "./section-editor";
import { readLandingSections } from "../../../../lib/demo-collections";

/**
 * The landing page, arranged with the engine's collection editor.
 *
 * A server component so the arrangement arrives in the HTML already resolved. The editor is
 * uncontrolled and the browser has to own the value, but the first read does not: reading here is what
 * makes a reload show the stored arrangement rather than an empty editor that fills in afterwards,
 * which is the difference between the page persisting and the page merely appearing to.
 *
 * The session is resolved by the shell layout above this route, and the action below refuses an
 * unauthenticated call regardless, so the guard is not repeated here for its side effect.
 */
export default async function PagesPage() {
  const sections = await readLandingSections();

  return <LandingPageEditor initial={sections} />;
}
