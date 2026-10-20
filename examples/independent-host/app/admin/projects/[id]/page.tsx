import { ExampleResourceForm } from "@/components/resource-form";
import { projectsResource } from "@/host/resources";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExampleResourceForm definition={projectsResource} id={id} />;
}
