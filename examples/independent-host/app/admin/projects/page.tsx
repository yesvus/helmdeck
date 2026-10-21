import { ExampleResourceList } from "@/components/resource-list";
import { projectsResource } from "@/host/resources";

export default function ProjectsPage() {
  return <ExampleResourceList definition={projectsResource} />;
}
