import { CustomLocaleProvider } from "../../components/custom-locale-provider";

export default function CustomLocalePage() {
  return (
    <CustomLocaleProvider>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm font-semibold text-brand-600">Custom locale build check</p>
        <h1 className="mt-3 text-3xl font-black">Administrationsseiten durchsuchen</h1>
      </main>
    </CustomLocaleProvider>
  );
}
