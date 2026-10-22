// SPDX-License-Identifier: MIT
/**
 * What Payload's dashboard says about the host it is mounted in.
 *
 * A bare admin panel is a second product wearing the same colours, and this is the sentence that
 * stops it reading as one: it says where the session came from, and that the content below is the
 * same content the shell's dashboard counts.
 *
 * A Server Component with no props, which is what Payload's `beforeDashboard` slot accepts. It
 * reads nothing from the database, so there is no second read path here to keep in step with the
 * first.
 */

export function PayloadDashboardBrief() {
  return (
    <section className="payload-dashboard-brief">
      <h2 className="payload-dashboard-brief__title">One host, one session</h2>
      <p className="payload-dashboard-brief__line">
        This panel is Payload&apos;s, mounted beside the shell rather than inside it. You signed in on
        the host&apos;s own form, and this is that session: there is no second account and no second
        password.
      </p>
      <p className="payload-dashboard-brief__line">
        The documents edited here are the documents the shell&apos;s dashboard counts. Both read them
        through the host&apos;s one call into Payload.
      </p>
    </section>
  );
}

export default PayloadDashboardBrief;
