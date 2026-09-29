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
import { AlertTriangle, BarChart3, CheckCircle2, Info, LineChart, Package, Palette, Rows3, type LucideIcon } from "lucide-react";
import {
  ADMIN_DENSITIES,
  AdminBanner,
  AdminBreadcrumbs,
  AdminChartFrame,
  AdminChartTable,
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
  AdminRankChart,
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
  AdminThemeSettingsProvider,
  AdminTimeSeriesChart,
  AdminToastCard,
  AdminToastViewport,
  AdminUrlFeedback,
  AdminWidget,
  AdminWidgetPanel,
  Button,
  Tooltip,
  TooltipProvider,
  adminActivityWidget,
  adminChartDayRange,
  adminChartFillDays,
  adminChartFormatters,
  adminChartWidget,
  adminDashboardAddPlacement,
  adminDashboardCopy,
  adminDashboardProblems,
  adminListWidget,
  adminRankWidget,
  adminStatWidget,
  adminTableWidget,
  adminWidgetState,
  createAdminWidgetRegistry,
  defineAdminWidget,
  englishAdminMessages,
  turkishAdminMessages,
  useAdminSortableList,
  useAdminTableSelection,
  type AdminChartPoint,
  type AdminChartSeries,
  type AdminChartStatus,
  type AdminDashboard,
  type AdminDensity,
  type AdminNavGroup,
  type AdminTableColumn,
  type AdminWidgetDefinition,
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

/** A fixed window rather than "the last seven days", so the labels a reader sees are the same ones every time. */
const CHART_END = new Date("2026-09-29T00:00:00.000Z");

/**
 * Cents per day, with a day missing on purpose.
 *
 * The 25th holds no row at all, which is the case the fill exists for: a store keeps nothing for a
 * day with no orders, and a chart built from the rows alone would draw a straight line across the
 * weekend and call it a trend. The previews are built through `adminChartFillDays` for the same
 * reason the analytics page is, so the card shows what the pipeline produces rather than a tidy
 * array that skips the awkward part.
 */
const REVENUE_CENTS: Record<string, number> = {
  "2026-09-23": 18420,
  "2026-09-24": 24650,
  "2026-09-26": 31200,
  "2026-09-27": 28990,
  "2026-09-28": 44150,
  "2026-09-29": 12780,
};

/**
 * The points the fill produced, kept as points rather than narrowed to categories.
 *
 * A point carries the value the series needs and a category does not, and the same array is handed
 * to a chart as its categories, which works because a point is a category with a number on it.
 */
const REVENUE_DAYS: AdminChartPoint[] = adminChartFillDays(
  adminChartDayRange(7, CHART_END),
  new Map(Object.entries(REVENUE_CENTS)),
  (key) => key.slice(8),
);

const money = adminChartFormatters("money");
const counts = adminChartFormatters("count");

const REVENUE_SERIES: AdminChartSeries[] = [
  { key: "revenue", label: "Revenue", values: REVENUE_DAYS.map((day) => day.value) },
];

/** A second series of the same order of magnitude, so the line variant has two lines to read. */
const LAST_WEEK_SERIES: AdminChartSeries[] = [
  ...REVENUE_SERIES,
  { key: "previous", label: "Previous week", values: [15900, 22100, 19800, 26400, 31200, 19050] },
];

const STOCK = [
  { key: "espresso", label: "Espresso machine", value: 58 },
  { key: "grinder", label: "Grinder", value: 31 },
  { key: "tamper", label: "Tamper", value: 12 },
  { key: "filter", label: "Water filter", value: 0 },
];

/**
 * One entry per state the frame reports, so the card shows what each of the four draws.
 *
 * Typed rather than inferred so every entry carries the same keys: a literal array narrows to a
 * union of four shapes, and a union with one member holding an `error` will not let the map below
 * read that key off all of them.
 */
const FRAME_STATES: ReadonlyArray<{
  status: AdminChartStatus;
  icon: LucideIcon;
  title: string;
  error?: Error;
}> = [
  { status: "loading", icon: LineChart, title: "Revenue by day" },
  { status: "empty", icon: LineChart, title: "Revenue by day" },
  {
    status: "error",
    icon: AlertTriangle,
    title: "Revenue by day",
    error: new Error("The orders table did not answer."),
  },
  { status: "ready", icon: BarChart3, title: "Units in stock by product" },
];

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

/**
 * The six tiles, declared the way a host declares them and rendered through the panel.
 *
 * The data is the same store the rest of the previews read, so the tiles show figures a reader can
 * check against the charts and tables beside them rather than numbers invented for a card. The
 * clock and the window are fixed for the same reason `CHART_END` is: a preview that re-reads the
 * current time shows different ages on every visit, and a card is meant to look the same twice.
 */
const PREVIEW_NOW = new Date("2026-09-30T09:00:00.000Z");
const ago = (ms: number) => new Date(PREVIEW_NOW.getTime() - ms);

/**
 * One age per product, one per branch of the feed's own thresholds.
 *
 * The branches are minutes, hours, days and past a week, plus under a minute, and a card showing
 * four of the five is a card whose fifth branch nothing here can see.
 */
const AGES: Record<string, number> = {
  kettle: 20_000,
  espresso: 3 * 60_000,
  grinder: 5 * 3_600_000,
  tamper: 2 * 86_400_000,
  filter: 9 * 86_400_000,
};

const TILE_ROWS = [
  { id: "espresso", name: "Espresso machine", status: "Published", cents: 12900, stock: 58 },
  { id: "grinder", name: "Grinder", status: "Draft", cents: 8900, stock: 31 },
  { id: "tamper", name: "Tamper", status: "Published", cents: 2400, stock: 12 },
  { id: "filter", name: "Water filter", status: "Archived", cents: 1800, stock: 0 },
  { id: "kettle", name: "Pour-over kettle", status: "Published", cents: 5600, stock: 7 },
];

const SHIPPED_TILES = [
  adminStatWidget({
    id: "previewStat",
    title: "Revenue, 30 days",
    unit: "money",
    value: (data: typeof TILE_ROWS) => data.reduce((total, row) => total + row.cents, 0),
    previous: (data: typeof TILE_ROWS) => data.reduce((total, row) => total + row.cents, 0) * 0.72,
    comparison: "vs the 30 days before",
    detail: () => "Paid orders only",
  }),
  adminStatWidget({
    id: "previewStatFalling",
    title: "Refunds, 30 days",
    unit: "money",
    value: () => 3200,
    previous: () => 2100,
    // The same rise as the tile above, and the opposite colour: this is the case a host gets wrong
    // by leaving `invertTrend` off, and a card that shows one of each says so better than a note.
    invertTrend: true,
    detail: () => "A rise here is bad news",
  }),
  adminTableWidget({
    id: "previewTable",
    title: "Products by revenue",
    rows: (data: typeof TILE_ROWS) => data,
    columns: [
      { key: "name", header: "Product", value: (row: (typeof TILE_ROWS)[number]) => row.name },
      { key: "cents", header: "Revenue", value: (row: (typeof TILE_ROWS)[number]) => row.cents },
    ],
    unit: "money",
    cap: { max: 3 },
  }),
  adminListWidget({
    id: "previewList",
    title: "Lowest in stock",
    rows: (data: typeof TILE_ROWS) => [...data].sort((a, b) => a.stock - b.stock),
    label: (row: (typeof TILE_ROWS)[number]) => row.name,
    value: (row: (typeof TILE_ROWS)[number]) => row.stock,
    note: (row: (typeof TILE_ROWS)[number]) => row.status,
    getKey: (row) => row.id,
  }),
  adminChartWidget({
    id: "previewChart",
    title: "Revenue by day",
    categories: () => REVENUE_DAYS,
    series: () => REVENUE_SERIES,
    unit: "money",
    height: 160,
  }),
  adminRankWidget({
    id: "previewRank",
    title: "Units in stock by product",
    items: () => STOCK,
    unit: "count",
    valueLabel: "units",
  }),
  adminActivityWidget({
    id: "previewActivity",
    title: "What changed",
    rows: (data: typeof TILE_ROWS) => data,
    message: (row: (typeof TILE_ROWS)[number]) => `${row.status} ${row.name}`,
    actor: () => "ada@example.com",
    // Four different ages, so the card shows more than one of the thresholds the feed owns rather
    // than five rows all saying the same thing.
    at: (row: (typeof TILE_ROWS)[number]) => ago(AGES[row.id as keyof typeof AGES] ?? 4 * 60_000),
    now: () => PREVIEW_NOW,
    tone: (row: (typeof TILE_ROWS)[number]) => (row.status === "Draft" ? "warning" : "success"),
    getKey: (row) => row.id,
  }),
] as const;

/** A tile in its own surface, since a preview card is a card and a bare definition is not one. */
function ShippedTile({ index }: { index: number }) {
  const definition = SHIPPED_TILES[index] as AdminWidgetDefinition<typeof TILE_ROWS>;
  return (
    <AdminWidgetPanel
      definition={definition}
      state={adminWidgetState(definition, TILE_ROWS)}
      messages={{ widget: englishAdminMessages.widget }}
    />
  );
}

/**
 * The stat card shows the tile twice, because one instance of it cannot show the decision.
 *
 * A stat's judgement is the colour, and a single tile with a rise says only that a rise is green,
 * which is half the claim. The pair is the claim: the same movement, the opposite tone, because one
 * declared `invertTrend` and the other did not.
 */
function ShippedStatTiles() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ShippedTile index={0} />
      <ShippedTile index={1} />
    </div>
  );
}

/**
 * One density step, scoped to its own element rather than to the document, so three of them can be
 * shown side by side. The ref is state because the provider takes the element it writes to, and
 * only has one on the render after mount.
 */
function DensitySample({ density }: { density: AdminDensity }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return (
    <AdminThemeSettingsProvider settings={{ density }} target={target}>
      <div ref={setTarget} className="space-y-2 rounded-lg border border-dashed border-zinc-200 p-3">
        <p className="text-xs font-semibold text-zinc-700">{density}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Save</Button>
          <Button size="sm" variant="outline">Cancel</Button>
        </div>
      </div>
    </AdminThemeSettingsProvider>
  );
}

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

  adminStatWidget: ShippedStatTiles,
  adminTableWidget: () => <ShippedTile index={2} />,
  adminListWidget: () => <ShippedTile index={3} />,
  adminChartWidget: () => <ShippedTile index={4} />,
  adminRankWidget: () => <ShippedTile index={5} />,
  adminActivityWidget: () => <ShippedTile index={6} />,

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

  AdminThemeSettingsProvider: () => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {ADMIN_DENSITIES.map((density) => (
          <DensitySample key={density} density={density} />
        ))}
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        Each block sets <span className="font-mono">--admin-density</span> on itself. Every
        <span className="font-mono"> p-*</span>, <span className="font-mono">gap-*</span> and
        fixed-height utility in the package reads it, which is why the same buttons sit at three
        different heights above.
      </p>
    </div>
  ),

  AdminTimeSeriesChart: () => (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-600">Bars, one per day</p>
        <AdminTimeSeriesChart
          ariaLabel="Revenue by day"
          categories={REVENUE_DAYS}
          series={REVENUE_SERIES}
          formatters={money}
          integerTicks
          height={200}
        />
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          The 25th is a day the store holds no order for. It is drawn as a zero beside the axis
          rather than left out, so the gap is visible instead of interpolated over. Hover a column
          for the exact amount.
        </p>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-600">Lines, two series on one axis</p>
        <AdminTimeSeriesChart
          ariaLabel="Revenue this week against last"
          categories={REVENUE_DAYS}
          series={LAST_WEEK_SERIES}
          formatters={money}
          integerTicks
          variant="line"
          height={200}
        />
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Both series are scaled against the same axis and the same peak, and the legend appears
          only once there is more than one.
        </p>
      </div>
    </div>
  ),

  AdminRankChart: () => (
    <div className="space-y-3">
      <AdminRankChart
        ariaLabel="Units in stock by product"
        items={STOCK}
        formatters={counts}
        valueLabel="units"
        integerTicks
      />
      <p className="text-xs leading-5 text-zinc-500">
        Every bar is a fraction of one axis whose top is 60, not of its own row, and the value is
        printed beside each bar so the two can be checked against each other. The last product is
        out of stock and draws nothing.
      </p>
    </div>
  ),

  AdminChartTable: () => (
    <div className="space-y-3">
      <AdminTimeSeriesChart
        ariaLabel="Revenue by day"
        categories={REVENUE_DAYS}
        series={REVENUE_SERIES}
        formatters={money}
        integerTicks
        height={180}
      />
      <AdminChartTable
        caption="Revenue by day, as a table"
        categories={REVENUE_DAYS}
        series={REVENUE_SERIES}
        format={money.value}
      />
      <p className="text-xs leading-5 text-zinc-500">
        The chart above already ships a copy of these seven rows, and this card places a second one,
        so the table is in the page twice over. An SVG drawing is an image to a screen reader, which
        is why the numbers are reachable without a mouse and why the two copies are built from the
        same points the bars are drawn from.
      </p>
    </div>
  ),

  AdminChartFrame: () => (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-zinc-500">
        The same card in the four states the engine reports. Only the ready one draws a chart, which
        is what stops a query that failed from arriving as a bar at zero.
      </p>
      {FRAME_STATES.map((state) => (
        <AdminChartFrame
          key={state.status}
          icon={state.icon}
          title={state.title}
          status={state.status}
          error={state.error}
          onRetry={state.status === "error" ? () => undefined : undefined}
          height={110}
        >
          <AdminRankChart
            ariaLabel="Units in stock by product"
            items={STOCK.slice(0, 3)}
            formatters={counts}
            valueLabel="units"
            integerTicks
          />
        </AdminChartFrame>
      ))}
    </div>
  ),
};
