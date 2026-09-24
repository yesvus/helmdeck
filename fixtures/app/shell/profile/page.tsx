import { sampleSession } from "../../../nav";

const sections = [
  { title: "Workspace", detail: "Northstar Supply · Owner: Morgan Lee", status: "Active" },
  { title: "Preferences", detail: "English (US) · Pacific Time · Weekly email summary", status: "Configured" },
  { title: "Security", detail: "Two-step verification enabled · Last password update: 42 days ago", status: "Protected" },
  { title: "Account status", detail: "Administrator access · Member since March 2022", status: "In good standing" },
];

export default function ProfilePage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-xl border border-zinc-200 bg-admin-surface p-6">
        <p className="text-sm font-medium text-brand-700">Account profile</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{sampleSession.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">{sampleSession.email} · {sampleSession.role}</p>
      </header>
      <section aria-label="Profile details" className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <article key={section.title} className="rounded-xl border border-zinc-200 bg-admin-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{section.title}</h2>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{section.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{section.detail}</p>
          </article>
        ))}
      </section>
      <p className="text-sm text-zinc-500">Account changes and authentication are managed by the application hosting this demo.</p>
    </main>
  );
}
