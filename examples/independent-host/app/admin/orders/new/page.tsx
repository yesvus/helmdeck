import { ExampleResourceForm } from "@/components/resource-form";
import { ordersResource } from "@/host/resources";

export default function NewOrderPage() {
  return <ExampleResourceForm definition={ordersResource} />;
}
