// SPDX-License-Identifier: MIT

/**
 * What Payload's dashboard says about the demo it is mounted in.
 *
 * A bare admin panel is a second product wearing the same colours, and this is the sentence that stops
 * it reading as one: it names what signed the person in, and it states plainly that the session came
 * from helmdeck's credential store rather than from a form on this screen.
 *
 * A Server Component with no props, which is what Payload's `beforeDashboard` slot accepts. It reads
 * nothing from the database, so there is no second read path here to keep in step with the first.
 */

export function PayloadDashboardBrief() {
  return (
    <section className="payload-dashboard-brief">
      <h2 className="payload-dashboard-brief__title">Helmdeck</h2>
      <p className="payload-dashboard-brief__line">
        Signed in on the demo&apos;s own form. This session is the one helmdeck&apos;s credential store
        holds, so there is no second account and no second password.
      </p>
      <p className="payload-dashboard-brief__line">
        Content lives here and in Payload&apos;s editor, blocks and versions. helmdeck&apos;s shell owns
        the dashboard, the analytics and the CRUD over this demo&apos;s own tables.
      </p>
    </section>
  );
}

export default PayloadDashboardBrief;