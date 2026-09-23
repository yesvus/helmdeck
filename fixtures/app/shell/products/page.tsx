import Link from "next/link";
import { FixtureCard } from "../../../components/fixture-card";

export default function ProductsPage() {
  return (
    <FixtureCard title="Products">
      Breadcrumb stops here.{" "}
      <Link href="/shell/products/new" className="font-semibold text-brand-600 hover:underline">
        Open the new product route
      </Link>{" "}
      to see one more segment.
    </FixtureCard>
  );
}
