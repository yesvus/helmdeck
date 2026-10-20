import { ExampleResourceList } from "@/components/resource-list";
import { ordersResource } from "@/host/resources";

export default function OrdersPage() {
  return <ExampleResourceList definition={ordersResource} />;
}
