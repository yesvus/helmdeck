"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Info, Trash2 } from "lucide-react";
import {
  AdminContentSkeleton,
  AdminDestructiveAction,
  AdminEmptyState,
  AdminField,
  AdminFieldGrid,
  AdminFormActions,
  AdminFormSection,
  AdminInput,
  AdminModal,
  AdminModalClose,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
  AdminModalTrigger,
  AdminPagination,
  AdminSelect,
  AdminSkeleton,
  AdminSortableList,
  AdminStatusPill,
  AdminSubmitButton,
  AdminTable,
  AdminToastCard,
  AdminToastViewport,
  Button,
  type AdminStatusTone,
  type AdminToastTone,
} from "../../../src";
import { Frame } from "../../components/frame";

type Row = { id: number; name: string; tone: AdminStatusTone; status: string; count: number };

const rows: Row[] = [
  { id: 1, name: "Café machine", tone: "success", status: "Published", count: 12 },
  { id: 2, name: "Grinder", tone: "warning", status: "Draft", count: 4 },
  { id: 3, name: "Water filter", tone: "neutral", status: "Archived", count: 0 },
];

type Toast = { id: number; tone: AdminToastTone; title: string; body: string; icon: React.ReactNode };

const toastSamples: Array<Pick<Toast, "tone" | "title" | "body" | "icon">> = [
  { tone: "success", title: "Saved", body: "Your changes are live.", icon: <CheckCircle2 className="h-5 w-5" /> },
  { tone: "info", title: "Heads up", body: "A publish is queued for review.", icon: <Info className="h-5 w-5" /> },
  { tone: "error", title: "Upload failed", body: "The file exceeded 10 MB.", icon: <AlertCircle className="h-5 w-5" /> },
];

export default function PrimitivesPage() {
  const [page, setPage] = useState(3);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [items, setItems] = useState(["Hero slide", "Feature grid", "Showcase", "FAQ"]);
  const [result, setResult] = useState<string>();

  function pushToast(sample: Pick<Toast, "tone" | "title" | "body" | "icon">) {
    const id = Date.now();
    setToasts((current) => [...current, { id, ...sample }]);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Primitives</h1>

      <Frame title="Button">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="white">White</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Frame>

      <Frame title="Field, input, select, submit">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setResult("Submitted (fixture only, nothing runs).");
          }}
        >
          <AdminFormSection title="Details" description="Collapsible section wrapper.">
            <AdminFieldGrid>
              <AdminField label="Name" hint="Shown in listings.">
                <AdminInput name="name" required placeholder="Machine name" />
              </AdminField>
              <AdminField label="Status">
                <AdminSelect name="status" defaultValue="draft">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </AdminSelect>
              </AdminField>
            </AdminFieldGrid>
          </AdminFormSection>
          <AdminFormActions>
            <AdminSubmitButton label="Save" icon={<Trash2 className="h-4 w-4" />} />
            <Button variant="ghost">Cancel</Button>
          </AdminFormActions>
          {result ? <p className="text-sm text-zinc-500">{result}</p> : null}
        </form>
      </Frame>

      <Frame title="Status pills">
        <div className="flex flex-wrap gap-2">
          <AdminStatusPill tone="success" label="Published" />
          <AdminStatusPill tone="warning" label="Draft" />
          <AdminStatusPill tone="error" label="Failed" />
          <AdminStatusPill tone="info" label="Queued" />
          <AdminStatusPill label="Archived" />
        </div>
      </Frame>

      <Frame title="Table and pagination">
        <AdminTable
          caption="Sample rows"
          columns={[
            { key: "name", header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
            { key: "status", header: "Status", cell: (row) => <AdminStatusPill tone={row.tone} label={row.status} /> },
            { key: "count", header: "Items", align: "right", cell: (row) => row.count },
          ]}
          rows={rows}
          getKey={(row) => row.id}
        />
        <div className="mt-4">
          <AdminPagination page={page} pageCount={9} onPageChange={setPage} />
        </div>
      </Frame>

      <Frame title="Empty state">
        <AdminEmptyState
          title="No products yet"
          body="Create your first product to see it here."
          action={<Button size="sm">New product</Button>}
        />
      </Frame>

      <Frame title="Skeletons">
        <AdminSkeleton className="h-4 w-40" />
        <div className="mt-3">
          <AdminContentSkeleton />
        </div>
      </Frame>

      <Frame title="Toast">
        <div className="flex flex-wrap gap-2">
          {toastSamples.map((sample) => (
            <Button key={sample.title} size="sm" variant="outline" onClick={() => pushToast(sample)}>
              {sample.title}
            </Button>
          ))}
        </div>
        <AdminToastViewport>
          {toasts.map((toast) => (
            <AdminToastCard
              key={toast.id}
              tone={toast.tone}
              title={toast.title}
              body={toast.body}
              icon={toast.icon}
              onClose={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            />
          ))}
        </AdminToastViewport>
      </Frame>

      <Frame title="Modal">
        <AdminModal>
          <AdminModalTrigger asChild>
            <Button variant="outline">Open modal</Button>
          </AdminModalTrigger>
          <AdminModalContent>
            <AdminModalHeader>
              <AdminModalTitle>Edit details</AdminModalTitle>
              <AdminModalDescription>Radix handles focus, escape and scroll lock.</AdminModalDescription>
            </AdminModalHeader>
            <div className="space-y-3">
              <AdminField label="Title">
                <AdminInput defaultValue="Hero slide" />
              </AdminField>
            </div>
            <AdminModalFooter>
              <AdminModalClose asChild>
                <Button variant="secondary">Cancel</Button>
              </AdminModalClose>
              <Button>Save</Button>
            </AdminModalFooter>
          </AdminModalContent>
        </AdminModal>
      </Frame>

      <Frame title="Destructive action">
        <AdminDestructiveAction
          buttonText="Delete product"
          title="Delete this product?"
          description="Stock, media and history for this product are removed."
          confirmLabel="Yes, delete"
          onConfirm={() =>
            pushToast({ ...toastSamples[0], title: "Deleted", body: "Fixture only, nothing was removed." })
          }
        />
      </Frame>

      <Frame title="Sortable list">
        <AdminSortableList
          items={items}
          onReorder={setItems}
          getKey={(item) => item}
          renderItem={(item) => <span className="block truncate text-sm text-zinc-700">{item}</span>}
        />
      </Frame>
    </main>
  );
}
