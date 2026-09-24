"use client";

import { FixtureCard } from "../../../components/fixture-card";
import { useDemoLocale } from "../../../components/demo-i18n-provider";

export default function OrdersPage() {
  const { copy } = useDemoLocale();
  return (
    <FixtureCard title="Orders">
      {copy.shellSettings.ordersPreview}
    </FixtureCard>
  );
}
