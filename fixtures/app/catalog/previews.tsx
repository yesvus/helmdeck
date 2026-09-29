// SPDX-License-Identifier: MIT
"use client";

/**
 * One working preview per component the catalogue says can be rendered, keyed by the export's own
 * name. The key is the join between this file and the catalogue's derived entry list: a component
 * marked renderable here is the same name the module namespace produced, so neither side can grow a
 * name the other has not heard of.
 *
 * Everything a preview needs is built here rather than fetched. A component that can only draw
 * something once a host has handed it a session, a media store or a permission rule is not faked,
 * because a mock would show the component's own markup and none of the wiring that makes it work.
 * Those entries say so instead, and `tests/component-catalog-page.test.tsx` renders everything
 * below so a preview that stops working fails rather than sitting there empty.
 */

import { useState, type ComponentType, type ReactNode } from "react";
import { CheckCircle2, Info, Package, Palette, Rows3 } from "lucide-react";
import {
  AdminBanner,
  AdminBreadcrumbs,
  AdminContextualHelp,
  AdminContentSkeleton,
  AdminDashboardLayout,
  AdminDashboardMissingTile,
  AdminDashboardTile,
  AdminDashboardTiles,
  AdminDestructiveAction,
  AdminDragHandle,
  AdminEmptyState,
  AdminField,
  AdminFieldGrid,
  AdminFormActions,
  AdminFormCard,
  AdminFormSection,
  AdminI18nProvider,
  AdminInput,
  AdminListItemCard,
  AdminLoginScreen,
  AdminMediaAspectRatioHint,
  AdminMediaPlaceholder,
  AdminModal,
  AdminModalBody,
  AdminModalClose,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
  AdminModalTrigger,
  AdminMobileNav,
  AdminNavLink,
  AdminPageActionLink,
  AdminPageHeader,
  AdminPagination,
  AdminPendingButton,
  AdminProfileMenu,
  AdminRepeaterListField,
  AdminSaveButton,
  AdminSearch,
  AdminSectionCard,
  AdminSectionIntro,
  AdminSelect,
  AdminSkeleton,
  AdminSortableCard,
  AdminSortableDndContext,
  AdminSortableRow,
  AdminSortableToast,
  AdminSplitFormLayout,
  AdminStatCard,
  AdminStatusPill,
  AdminSubmitButton,
  AdminSurfaceCard,
  AdminTable,
  AdminTableBulkActions,
  AdminTableRowActions,
  AdminTextarea,
  AdminToastCard,
  AdminToastViewport,
  AdminUrlFeedback,
  AdminWidget,
  AdminWidgetPanel,
  Button,
  Tooltip,
  TooltipProvider,
  adminDashboardAddPlacement,
  adminDashboardCopy,
  adminDashboardProblems,
  adminWidgetState,
  createAdminWidgetRegistry,
  defineAdminWidget,
  englishAdminMessages,
  turkishAdminMessages,
  useAdminSortableList,
  useAdminTableSelection,
  type AdminDashboard,
  type AdminNavGroup,
  type AdminTableColumn,
  type AdminWidgetLoader,
  type AdminWidgetState,
} from "@yesvus/helmdeck";

const NAV: AdminNavGroup[] = [
  {
    label: "Content",
    items: [
      { href: "/catalog", label: "Component catalogue", mobilePrimary: true, icon: "overview" },
      { href: "/catalog/primitives", label: "Primitives", icon: "product" },
      { href: "/catalog/theme", label: "Theme", icon: "palette" },
    ],
  },
];

const SEARCH_ENTRIES = [
  { href: "/catalog/primitives", label: "Browse the primitives", group: "Catalogue" },
];

type Row = { id: string; name: string; tone: "success" | "warning" | "neutral"; status: string; count: number };

const ROWS: Row[] = [
  { id: "espresso", name: "Espresso machine", tone: "success", status: "Published", count: 12 },
  { id: "grinder", name: "Grinder", tone: "warning", status: "Draft", count: 4 },
  { id: "filter", name: "Water filter", tone: "neutral", status: "Archived", count: 0 },
];

const COLUMNS: AdminTableColumn<Row>[] = [
  { key: "name", header: "Product", cell: (row) => <span className="font-medium">{row.name}</span> },
  { key: "status", header: "Status", cell: (row) => <AdminStatusPill tone={row.tone} label={row.status} /> },
  { key: "count", header: "In stock", align: "right", cell: (row) => row.count },
];

/** A fixed position inside a card escapes the card, so a transform gives the card a containing block. */
function Contained({ children, height = "h-24" }: { children: ReactNode; height?: string }) {
  return <div className={`relative overflow-hidden rounded-lg border border-dashed border-zinc-200 ${height}`} style={{ transform: "translateZ(0)" }}>{children}</div>;
}

/** Every dialog part is shown inside a real dialog, since none of them renders anything alone. */
function dialogPart(render: () => ReactNode): ComponentType {
  return function DialogPart() {
    const [open, setOpen] = useState(false);
    return (
      <AdminModal open={open} onOpenChange={setOpen}>
        <Button variant="outline" onClick={() => setOpen(true)}>Open the dialog</Button>
        <AdminModalContent aria-label="Dialog sample">
          <div className="space-y-3 p-6">{render()}</div>
        </AdminModalContent>
      </AdminModal>
    );
  };
}

const SORTABLE_ITEMS = ["Espresso machine", "Grinder", "Water filter"];

function SortableFrame({ children = null, toast }: { children?: ReactNode; toast?: { tone: "success" | "error"; message: string } | null }) {
  const sortable = useAdminSortableList({
    items: SORTABLE_ITEMS,
    getId: (item) => item,
    onReorder: async (orderedIds) => ({ success: true, message: `Saved: ${orderedIds.join(", ")}` }),
  });
  return (
    <AdminSortableDndContext
      id="catalog-sortable"
      ids={sortable.ids}
      sensors={sortable.sensors}
      announcements={sortable.announcements}
      onDragEnd={sortable.handleDragEnd}
    >
      {children}
      <AdminSortableToast toast={toast ?? sortable.toast} onDismiss={sortable.dismissToast} />
    </AdminSortableDndContext>
  );
}

const registry = createAdminWidgetRegistry([
  defineAdminWidget<{ total: number; units: number }>({
    id: "catalogueSize",
    title: "Catalogue size",
    sizes: ["sm", "md"],
    isEmpty: (data) => data.total === 0,
    render: (data) => (
      <>
        <p className="text-2xl font-semibold text-zinc-900">{data.total} products</p>
        <p className="mt-1 text-xs text-zinc-500">{data.units} units in stock</p>
      </>
    ),
  }),
  defineAdminWidget<{ name: string; stock: number }>({
    id: "reorder",
    title: "Reorder list",
    sizes: ["md", "lg"],
    render: (data) => <p className="text-sm text-zinc-700">{data.name}: {data.stock} left</p>,
  }),
]);

const placements = ["catalogueSize", "reorder"].reduce<AdminDashboard>(
  (current, widget) => adminDashboardAddPlacement(current, registry, widget),
  { name: "catalogue", placements: [] },
).placements;

const STATES: Record<string, AdminWidgetState<unknown>> = Object.fromEntries(
  placements.map((placement) => [
    placement.id,
    placement.widget === "catalogueSize"
      ? adminWidgetState(registry.get("catalogueSize")!, { total: 24, units: 312 })
      : adminWidgetState(registry.get("reorder")!, { name: "Water filter", stock: 0 }),
  ]),
);

const missingPlacement = { id: "catalog-archive", widget: "archivedWidget", size: "sm" as const };

const loaders: Record<string, AdminWidgetLoader<unknown>> = {
  [placements[0].id]: async () => ({ total: 24, units: 312 }),
  [placements[1].id]: async () => ({ name: "Water filter", stock: 0 }),
};

function SampleForm({ children }: { children: ReactNode }) {
  return <form onSubmit={(event) => event.preventDefault()} className="space-y-4">{children}</form>;
}

function PagerSample() {
  const [page, setPage] = useState(4);
  return <AdminPagination page={page} pageCount={12} onPageChange={setPage} />;
}

function BulkActionsSample() {
  const { selectedKeys, setSelectedKeys } = useAdminTableSelection<string>();
  return (
    <div className="space-y-3">
      <AdminTableBulkActions selectedCount={selectedKeys.size} selectedCountLabel={(count) => `${count} selected`}>
        <Button size="sm">Publish</Button>
        <Button size="sm" variant="outline">Archive</Button>
      </AdminTableBulkActions>
      <AdminTable
        caption="Catalogue sample"
        columns={COLUMNS}
        rows={ROWS}
        getKey={(row) => row.id}
        selection={{
          selectedKeys,
          onSelectionChange: (keys) => setSelectedKeys(new Set([...keys].map(String))),
          label: "Select product",
          selectAllLabel: "Select every product",
        }}
      />
    </div>
  );
}

export const catalogPreviews: Record<string, ComponentType> = {
  Button: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
      <Button size="sm">Small</Button>
      <Button size="lg">Large</Button>
    </div>
  ),

  AdminSaveButton: () => <SampleForm><AdminSaveButton label="Save changes" /></SampleForm>,
  AdminSubmitButton: () => <SampleForm><AdminSubmitButton label="Publish" /></SampleForm>,
  AdminPendingButton: () => (
    <SampleForm>
      <div className="flex flex-wrap gap-2">
        <AdminPendingButton label="Send" />
        <AdminPendingButton label="Publish" tone="secondary" />
        <AdminPendingButton label="Delete" tone="danger" />
      </div>
    </SampleForm>
  ),

  AdminField: () => (
    <AdminField label="Product name" hint="Shown on the storefront." error="A name is required.">
      <AdminInput defaultValue="" />
    </AdminField>
  ),
  AdminFieldGrid: () => (
    <AdminFieldGrid>
      <AdminField label="Width"><AdminInput defaultValue="1200" /></AdminField>
      <AdminField label="Height"><AdminInput defaultValue="800" /></AdminField>
    </AdminFieldGrid>
  ),
  AdminFormActions: () => (
    <AdminFormActions>
      <Button variant="ghost">Cancel</Button>
      <Button>Save</Button>
    </AdminFormActions>
  ),
  AdminFormSection: () => (
    <AdminFormSection title="Details" description="What the product is and what it costs.">
      <p className="text-sm text-zinc-600">A section that folds away when it is not the part being edited.</p>
    </AdminFormSection>
  ),
  AdminInput: () => <AdminInput placeholder="Search the catalogue" />,
  AdminTextarea: () => <AdminTextarea rows={3} defaultValue="A short description of the product." />,
  AdminSelect: () => (
    <AdminSelect defaultValue="draft">
      <option value="draft">Draft</option>
      <option value="published">Published</option>
      <option value="archived">Archived</option>
    </AdminSelect>
  ),
  AdminRepeaterListField: () => (
    <SampleForm>
      <AdminRepeaterListField
        label="Variants"
        hint="One per line, as they are stored."
        name="variants"
        addLabel="Add variant"
        itemLabel="Variant"
        defaultItems={["Single", "Double"]}
      />
    </SampleForm>
  ),

  AdminTable: () => (
    <AdminTable caption="Catalogue sample" columns={COLUMNS} rows={ROWS} getKey={(row) => row.id} />
  ),
  AdminTableBulkActions: BulkActionsSample,
  AdminTableRowActions: () => (
    <AdminTable
      caption="Catalogue sample"
      columns={[
        { key: "name", header: "Product", cell: (row) => row.name },
        {
          key: "actions",
          header: "Actions",
          className: "min-w-48",
          cell: (row) => (
            <AdminTableRowActions label={`Actions for ${row.name}`} destructive={<Button size="sm" variant="destructive">Delete</Button>}>
              <Button size="sm" variant="outline">Edit</Button>
            </AdminTableRowActions>
          ),
        },
      ]}
      rows={ROWS}
      getKey={(row) => row.id}
    />
  ),
  AdminStatusPill: () => (
    <div className="flex flex-wrap gap-2">
      <AdminStatusPill tone="success" label="Published" />
      <AdminStatusPill tone="warning" label="Draft" />
      <AdminStatusPill tone="error" label="Failed" />
      <AdminStatusPill tone="info" label="Queued" />
      <AdminStatusPill label="Archived" />
    </div>
  ),
  AdminSkeleton: () => (
    <div className="space-y-2">
      <AdminSkeleton className="h-4 w-40" />
      <AdminSkeleton className="h-4 w-64" />
      <AdminSkeleton className="h-10 w-full" />
    </div>
  ),
  AdminContentSkeleton: () => <AdminContentSkeleton />,
  AdminEmptyState: () => (
    <AdminEmptyState
      title="No products yet"
      body="Once a product is published it appears here, and this state is what a new admin sees."
      action={<Button size="sm">Add a product</Button>}
    />
  ),
  AdminStatCard: () => (
    <div className="grid gap-3 sm:grid-cols-2">
      <AdminStatCard icon={Package} label="Products" value="24" detail="Published and draft together" />
      <AdminStatCard icon={Rows3} label="Orders" value="128" detail="Placed in the last 30 days" tone="success" />
    </div>
  ),
  AdminListItemCard: () => (
    <div className="space-y-3">
      <AdminListItemCard
        title="Espresso machine"
        subtitle="Two group head, plumbed in"
        meta={<span>SKU ESM-200 · 12 in stock · updated today</span>}
        action={<Button size="sm" variant="outline">Edit</Button>}
      />
      <AdminListItemCard title="Grinder" meta={<span>SKU GRD-010 · 4 in stock</span>} />
    </div>
  ),
  AdminPagination: PagerSample,

  AdminBanner: () => (
    <div className="space-y-3">
      <AdminBanner tone="info" title="Import finished" body="24 products were added and 3 were skipped." />
      <AdminBanner tone="warning" title="Storage nearly full" body="The media store is at 92% of its quota." />
      <AdminBanner tone="error" title="Import failed" body="Row 41 has a SKU that already exists." />
    </div>
  ),
  AdminToastCard: () => (
    <AdminToastCard tone="success" title="Saved" body="The product was published." icon={<CheckCircle2 className="h-5 w-5" />} onClose={() => undefined} />
  ),
  AdminToastViewport: () => (
    <Contained height="h-32">
      <AdminToastViewport>
        <AdminToastCard tone="info" title="Queued" body="The export will finish in a minute." icon={<Info className="h-5 w-5" />} onClose={() => undefined} />
      </AdminToastViewport>
    </Contained>
  ),
  AdminDestructiveAction: () => (
    <SampleForm>
      <AdminDestructiveAction
        buttonText="Delete product"
        title="Delete Espresso machine"
        description="This removes the product and its three variants. Orders that reference it are kept."
        confirmLabel="Delete it"
        onConfirm={() => undefined}
      />
    </SampleForm>
  ),
  AdminModal: dialogPart(() => (
    <p className="text-sm text-zinc-600">
      The root holds the open state, traps the focus and closes on escape. The parts inside it are what
      give the dialog its shape.
    </p>
  )),
  AdminModalTrigger: () => (
    <AdminModal>
      <AdminModalTrigger asChild>
        <Button variant="outline">Open the dialog</Button>
      </AdminModalTrigger>
      <AdminModalContent aria-label="Trigger sample">
        <div className="p-6">
          <AdminModalHeader>
            <AdminModalTitle>Editing a product</AdminModalTitle>
            <AdminModalDescription>Only the name and the status change here.</AdminModalDescription>
          </AdminModalHeader>
        </div>
      </AdminModalContent>
    </AdminModal>
  ),
  AdminModalContent: dialogPart(() => <p className="text-sm text-zinc-600">The surface, sized for a phone and for a desktop.</p>),
  AdminModalHeader: dialogPart(() => (
    <AdminModalHeader>
      <AdminModalTitle>Editing a product</AdminModalTitle>
    </AdminModalHeader>
  )),
  AdminModalTitle: dialogPart(() => <AdminModalTitle>Editing a product</AdminModalTitle>),
  AdminModalDescription: dialogPart(() => (
    <AdminModalDescription>Changing the name does not change the slug the storefront uses.</AdminModalDescription>
  )),
  AdminModalBody: dialogPart(() => (
    <AdminModalBody>
      <AdminField label="Product name">
        <AdminInput defaultValue="Espresso machine" />
      </AdminField>
    </AdminModalBody>
  )),
  AdminModalFooter: dialogPart(() => (
    <AdminModalFooter>
      <Button variant="secondary">Cancel</Button>
      <Button>Save</Button>
    </AdminModalFooter>
  )),
  AdminModalClose: dialogPart(() => (
    <AdminModalClose asChild>
      <Button variant="secondary">Close</Button>
    </AdminModalClose>
  )),
  Tooltip: () => (
    <Tooltip content="Deleting cannot be undone" label="What this does">
      <Button variant="outline">Delete</Button>
    </Tooltip>
  ),
  TooltipProvider: () => (
    <TooltipProvider delay={150}>
      <div className="flex flex-wrap items-center gap-3">
        <Tooltip content="Every surface shares this delay" label="Shared delay">
          <Button variant="outline">First</Button>
        </Tooltip>
        <Tooltip content="Hover or focus to see it" label="Second">
          <Button variant="outline">Second</Button>
        </Tooltip>
      </div>
      <p className="mt-3 text-xs text-zinc-500">The delay is held once, by the provider, not per tooltip.</p>
    </TooltipProvider>
  ),
  AdminContextualHelp: () => (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900">
      Catalogue size
      <AdminContextualHelp label="Help: Catalogue size">
        Published and draft products together, counted when this page loaded.
      </AdminContextualHelp>
    </span>
  ),
  AdminUrlFeedback: () => (
    <Contained height="h-28">
      <AdminUrlFeedback message="Product published." status="success" assetUrl="/catalog" />
    </Contained>
  ),

  AdminSortableDndContext: () => (
    <SortableFrame>
      <div className="space-y-2">
        {SORTABLE_ITEMS.map((item) => (
          <AdminSortableCard key={item} id={item} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-admin-surface px-3 py-2">
            <AdminDragHandle label={`Reorder ${item}`} />
            <span className="text-sm text-zinc-700">{item}</span>
          </AdminSortableCard>
        ))}
      </div>
    </SortableFrame>
  ),
  AdminSortableCard: () => (
    <SortableFrame>
      <div className="space-y-2">
        {SORTABLE_ITEMS.map((item) => (
          <AdminSortableCard key={item} id={item} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-admin-surface px-3 py-2">
            <AdminDragHandle label={`Reorder ${item}`} />
            <span className="text-sm text-zinc-700">{item}</span>
          </AdminSortableCard>
        ))}
      </div>
    </SortableFrame>
  ),
  AdminSortableRow: () => (
    <SortableFrame>
      <table className="w-full text-sm">
        <tbody>
          {SORTABLE_ITEMS.map((item) => (
            <AdminSortableRow key={item} id={item} className="border-b border-zinc-200">
              <td className="w-10 py-2"><AdminDragHandle label={`Reorder ${item}`} /></td>
              <td className="py-2 text-zinc-700">{item}</td>
            </AdminSortableRow>
          ))}
        </tbody>
      </table>
    </SortableFrame>
  ),
  AdminDragHandle: () => (
    <SortableFrame>
      <AdminSortableCard id={SORTABLE_ITEMS[0]} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-admin-surface px-3 py-2">
        <AdminDragHandle label={`Reorder ${SORTABLE_ITEMS[0]}`} />
        <span className="text-sm text-zinc-700">{SORTABLE_ITEMS[0]}</span>
      </AdminSortableCard>
    </SortableFrame>
  ),
  AdminSortableToast: () => (
    <SortableFrame toast={{ tone: "success", message: "Saved: Grinder, Espresso machine, Water filter" }} />
  ),

  AdminSurfaceCard: () => (
    <AdminSurfaceCard>
      <div className="p-5">
        <p className="text-sm font-semibold text-zinc-900">A surface, for a host composing its own sections.</p>
        <p className="mt-1 text-sm text-zinc-500">The border, radius and background every card in the package shares.</p>
      </div>
    </AdminSurfaceCard>
  ),
  AdminSectionCard: () => (
    <AdminSectionCard
      icon={Package}
      title="Catalogue"
      description="Everything the storefront can show, in the order the storefront shows it."
      action={<Button size="sm" variant="outline">Add</Button>}
    >
      <p className="text-sm text-zinc-600">The body of the section.</p>
    </AdminSectionCard>
  ),
  AdminSectionIntro: () => (
    <AdminSectionIntro
      icon={Palette}
      title="Theme"
      description="The tokens the package ships and the ones a host can override."
      action={<Button size="sm">Customise</Button>}
    />
  ),
  AdminFormCard: () => (
    <AdminFormCard title="Publishing" subtitle="When and by whom this product goes live.">
      <div className="space-y-3">
        <AdminField label="Publish date"><AdminInput type="date" defaultValue="2026-10-01" /></AdminField>
        <AdminFormActions>
          <Button variant="ghost">Discard</Button>
          <Button>Save</Button>
        </AdminFormActions>
      </div>
    </AdminFormCard>
  ),
  AdminSplitFormLayout: () => (
    <AdminSplitFormLayout
      content={
        <AdminFormCard title="Details">
          <AdminField label="Product name"><AdminInput defaultValue="Espresso machine" /></AdminField>
        </AdminFormCard>
      }
      sidebar={
        <AdminStatCard icon={Package} label="Units" value="312" detail="In stock across every warehouse" />
      }
    />
  ),

  AdminBreadcrumbs: () => <AdminBreadcrumbs groups={NAV} />,
  AdminPageHeader: () => (
    <Contained height="h-20">
      <AdminPageHeader title="Component catalogue" groups={NAV} action={<Button size="sm">Add</Button>} />
    </Contained>
  ),
  AdminPageActionLink: () => (
    <div className="flex flex-wrap gap-3">
      <AdminPageActionLink href="/catalog/new" label="New product" />
      <AdminPageActionLink href="/catalog" label="Back to the catalogue" tone="secondary" />
    </div>
  ),
  AdminNavLink: () => (
    <div className="flex flex-wrap gap-2">
      {NAV.flatMap((group) => group.items).map((item) => (
        <AdminNavLink key={item.href} item={item} />
      ))}
    </div>
  ),
  AdminMobileNav: () => (
    <Contained height="h-20">
      <AdminMobileNav groups={NAV} />
    </Contained>
  ),
  AdminSearch: () => <AdminSearch groups={NAV} entries={SEARCH_ENTRIES} />,
  AdminProfileMenu: () => (
    <div className="flex justify-end">
      <AdminProfileMenu
        email="ada@example.com"
        profileHref="/catalog/profile"
        viewSiteHref="https://example.com"
        onLogout={() => undefined}
      />
    </div>
  ),
  AdminLoginScreen: () => (
    <Contained height="h-80">
      <AdminLoginScreen brandLabel="Helmdeck" message="Sign in to continue." onSubmit={() => undefined} />
    </Contained>
  ),

  AdminWidget: () => (
    <AdminWidget
      definition={registry.get("reorder")!}
      state={adminWidgetState(registry.get("reorder")!, { name: "Water filter", stock: 3 })}
    />
  ),
  AdminWidgetPanel: () => (
    <AdminWidgetPanel
      definition={registry.get("reorder")!}
      state={adminWidgetState(registry.get("reorder")!, { name: "Water filter", stock: 3 })}
      messages={{ widget: englishAdminMessages.widget }}
    />
  ),
  AdminDashboardLayout: () => (
    <AdminDashboardLayout registry={registry} placements={placements} states={STATES} />
  ),
  AdminDashboardTile: () => (
    <AdminDashboardTile
      placement={placements[0]}
      definition={registry.get("catalogueSize")!}
      state={STATES[placements[0].id]}
      problems={adminDashboardProblems(registry, [placements[0]]).get(placements[0].id) ?? []}
      copy={adminDashboardCopy()}
    />
  ),
  AdminDashboardTiles: () => (
    <AdminDashboardTiles registry={registry} placements={placements} loaders={loaders} />
  ),
  AdminDashboardMissingTile: () => (
    <AdminDashboardMissingTile
      placement={missingPlacement}
      problems={adminDashboardProblems(registry, [missingPlacement]).get(missingPlacement.id) ?? []}
      copy={adminDashboardCopy()}
    />
  ),

  AdminMediaPlaceholder: () => (
    <div className="grid grid-cols-4 gap-3">
      {(["image", "video", "pdf", "external"] as const).map((kind) => (
        <AdminMediaPlaceholder key={kind} kind={kind} className="h-20 rounded-lg" label={`${kind} placeholder`} />
      ))}
    </div>
  ),
  AdminMediaAspectRatioHint: () => <AdminMediaAspectRatioHint aspectRatio="16:9" />,

  AdminI18nProvider: () => (
    <div className="space-y-3">
      <AdminI18nProvider locale="en">
        <p className="text-sm text-zinc-700">English: the interface and the content are both English.</p>
      </AdminI18nProvider>
      <AdminI18nProvider locale="tr" messages={turkishAdminMessages}>
        <p className="text-sm text-zinc-700">Turkish: the same surface, with a dictionary the host supplied.</p>
      </AdminI18nProvider>
    </div>
  ),
};
