import { ExampleResourceForm } from "@/components/resource-form";
import { projectsResource } from "@/host/resources";

export default function NewProjectPage() {
  return <ExampleResourceForm definition={projectsResource} />;
}
