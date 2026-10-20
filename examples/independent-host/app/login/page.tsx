import { Suspense } from "react";
import { HostLoginForm } from "@/components/host-login-form";

export default function LoginPage() {
  return (
    <main>
      <h1 className="p-8 pb-0 text-2xl font-semibold">Sign in</h1>
      <Suspense fallback={<p className="p-8" role="status">Loading sign in…</p>}>
        <HostLoginForm />
      </Suspense>
    </main>
  );
}
