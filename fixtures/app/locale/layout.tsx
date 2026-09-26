import type { ReactNode } from "react";
import { LocaleAdapterProvider } from "../../components/locale-adapter-provider";

export default function LocaleLayout({ children }: { children: ReactNode }) {
  return <LocaleAdapterProvider>{children}</LocaleAdapterProvider>;
}
