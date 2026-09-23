import type { ReactNode } from "react";

export function AdminEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-zinc-700">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
