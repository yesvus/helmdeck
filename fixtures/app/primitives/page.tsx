"use client";

import { useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Trash2 } from "lucide-react";
import {
  AdminContentSkeleton,
  AdminDestructiveAction,
  AdminDragHandle,
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
  AdminSortableCard,
  AdminSortableDndContext,
  AdminSortableToast,
  AdminStatusPill,
  AdminSubmitButton,
  AdminTable,
  AdminToastCard,
  AdminToastViewport,
  Button,
  useAdminSortableList,
  type AdminStatusTone,
  type AdminToastTone,
} from "@yesvus/helmdeck";
import { Frame } from "../../components/frame";
import { useDemoLocale } from "../../components/demo-i18n-provider";

type Row = { id: number; name: string; tone: AdminStatusTone; status: string; count: number };
type Toast = { id: number; tone: AdminToastTone; title: string; body: string; icon: ReactNode };

export default function PrimitivesPage() {
  const { copy } = useDemoLocale();
  const text = copy.primitives;
  const [page, setPage] = useState(3);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [items, setItems] = useState<string[]>(() => [...text.sortableItems]);
  const [result, setResult] = useState<string>();

  const rows: Row[] = [
    { id: 1, name: "Café machine", tone: "success", status: text.published, count: 12 },
    { id: 2, name: "Grinder", tone: "warning", status: text.draft, count: 4 },
    { id: 3, name: "Water filter", tone: "neutral", status: text.archived, count: 0 },
  ];
  const toastSamples: Array<Pick<Toast, "tone" | "title" | "body" | "icon">> = [
    { tone: "success", title: text.saved, body: text.savedBody, icon: <CheckCircle2 className="h-5 w-5" /> },
    { tone: "info", title: text.headsUp, body: text.publishQueued, icon: <Info className="h-5 w-5" /> },
    { tone: "error", title: text.uploadFailed, body: text.uploadFailedBody, icon: <AlertCircle className="h-5 w-5" /> },
  ];

  const sortable = useAdminSortableList({
    items,
    getId: (item) => item,
    onReorder: async (orderedIds) => {
      setItems(orderedIds);
      return { success: true, message: text.savedOrder(orderedIds) };
    },
  });

  function pushToast(sample: Pick<Toast, "tone" | "title" | "body" | "icon">) {
    const id = Date.now();
    setToasts((current) => [...current, { id, ...sample }]);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">{text.title}</h1>

      <Frame title={text.button}>
        <div className="flex flex-wrap gap-2">
          <Button>{text.primary}</Button>
          <Button variant="destructive">{text.delete}</Button>
          <Button variant="outline">{text.outline}</Button>
          <Button variant="secondary">{text.secondary}</Button>
          <Button variant="ghost">{text.ghost}</Button>
          <Button variant="link">{text.link}</Button>
          <Button variant="white">{text.white}</Button>
          <Button size="sm">{text.small}</Button>
          <Button size="lg">{text.large}</Button>
        </div>
      </Frame>

      <Frame title={text.fieldTitle}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setResult(text.submitted);
          }}
        >
          <AdminFormSection title={text.details} description={text.detailsBody}>
            <AdminFieldGrid>
              <AdminField label={text.name} hint={text.nameHint}>
                <AdminInput name="name" required placeholder={text.machineName} />
              </AdminField>
              <AdminField label={text.status}>
                <AdminSelect name="status" defaultValue="draft">
                  <option value="draft">{text.draft}</option>
                  <option value="published">{text.published}</option>
                  <option value="archived">{text.archived}</option>
                </AdminSelect>
              </AdminField>
            </AdminFieldGrid>
          </AdminFormSection>
          <AdminFormActions>
            <AdminSubmitButton label={text.save} icon={<Trash2 className="h-4 w-4" />} />
            <Button variant="ghost">{text.cancel}</Button>
          </AdminFormActions>
          {result ? <p className="text-sm text-zinc-500">{result}</p> : null}
        </form>
      </Frame>

      <Frame title={text.statusPills}>
        <div className="flex flex-wrap gap-2">
          <AdminStatusPill tone="success" label={text.published} />
          <AdminStatusPill tone="warning" label={text.draft} />
          <AdminStatusPill tone="error" label={text.failed} />
          <AdminStatusPill tone="info" label={text.queued} />
          <AdminStatusPill label={text.archived} />
        </div>
      </Frame>

      <Frame title={text.table}>
        <AdminTable
          caption={text.sampleRows}
          columns={[
            { key: "name", header: text.name, cell: (row) => <span className="font-medium">{row.name}</span> },
            { key: "status", header: text.status, cell: (row) => <AdminStatusPill tone={row.tone} label={row.status} /> },
            { key: "count", header: text.items, align: "right", cell: (row) => row.count },
          ]}
          rows={rows}
          getKey={(row) => row.id}
        />
        <div className="mt-4">
          <AdminPagination page={page} pageCount={9} onPageChange={setPage} />
        </div>
      </Frame>

      <Frame title={text.empty}>
        <AdminEmptyState
          title={text.noProducts}
          body={text.noProductsBody}
          action={<Button size="sm">{text.newProduct}</Button>}
        />
      </Frame>

      <Frame title={text.skeletons}>
        <AdminSkeleton className="h-4 w-40" />
        <div className="mt-3">
          <AdminContentSkeleton />
        </div>
      </Frame>

      <Frame title={text.toast}>
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

      <Frame title={text.modal}>
        <AdminModal>
          <AdminModalTrigger asChild>
            <Button variant="outline">{text.openModal}</Button>
          </AdminModalTrigger>
          <AdminModalContent>
            <AdminModalHeader>
              <AdminModalTitle>{text.editDetails}</AdminModalTitle>
              <AdminModalDescription>{text.modalBody}</AdminModalDescription>
            </AdminModalHeader>
            <div className="space-y-3">
              <AdminField label={text.titleField}>
                <AdminInput defaultValue={text.heroSlide} />
              </AdminField>
            </div>
            <AdminModalFooter>
              <AdminModalClose asChild>
                <Button variant="secondary">{text.cancel}</Button>
              </AdminModalClose>
              <Button>{text.save}</Button>
            </AdminModalFooter>
          </AdminModalContent>
        </AdminModal>
      </Frame>

      <Frame title={text.destructive}>
        <AdminDestructiveAction
          buttonText={text.deleteProduct}
          title={text.deleteProductTitle}
          description={text.deleteProductBody}
          confirmLabel={text.delete}
          onConfirm={() =>
            pushToast({ tone: "success", title: text.deleted, body: text.deletedBody, icon: <CheckCircle2 className="h-5 w-5" /> })
          }
        />
      </Frame>

      <Frame title={text.sortable}>
        <AdminSortableDndContext
          ids={sortable.ids}
          sensors={sortable.sensors}
          announcements={sortable.announcements}
          onDragEnd={sortable.handleDragEnd}
        >
          <div className="space-y-2">
            {sortable.orderedItems.map((item) => (
              <AdminSortableCard
                key={item}
                id={item}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2"
              >
                <AdminDragHandle label={text.reorder(item)} />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{item}</span>
              </AdminSortableCard>
            ))}
          </div>
        </AdminSortableDndContext>
        <AdminSortableToast toast={sortable.toast} onDismiss={sortable.dismissToast} />
      </Frame>
    </main>
  );
}
