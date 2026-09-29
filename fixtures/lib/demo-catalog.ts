// SPDX-License-Identifier: MIT
import * as baselineExports from "@yesvus/helmdeck/baseline";
import * as rootExports from "@yesvus/helmdeck";

/**
 * The catalogue of everything the package ships, built from the module namespaces rather than from
 * a list written out here.
 *
 * A hand-written list rots silently: the first export added without a line beside it leaves a
 * catalogue that looks complete and is not. So the names come from `Object.keys` over the real
 * entry points, the kind and the signature come from inspecting the value, and the table below is
 * only the judgement a machine cannot make. `tests/component-catalog.test.ts` checks the table
 * against the namespaces in both directions, so a new export fails the build instead of quietly
 * being absent, and a renamed one fails too.
 */
export const CATALOG_CATEGORIES = [
  "Actions and buttons",
  "Forms and fields",
  "Data display",
  "Charts",
  "Overlays and feedback",
  "Sorting and reordering",
  "Layout",
  "Shell and navigation",
  "Auth and permissions",
  "Credentials and sessions",
  "Dashboard and widgets",
  "Collections",
  "Media",
  "Resources",
  "Internationalisation",
  "Theme and colour",
  "Adapters",
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];
export type CatalogKind = "component" | "hook" | "function" | "constant";
export type CatalogEntryPoint = "." | "./baseline";

export type CatalogEntry = {
  name: string;
  entryPoint: CatalogEntryPoint;
  kind: CatalogKind;
  category: CatalogCategory | null;
  summary: string;
  /** Everything a search matches against: the name, the description, the keywords and the kind. */
  searchText: string;
  /** Whether the page can render this component. The preview registry is keyed by export name. */
  renderable: boolean;
  /** Why a component has nothing to show. Null when it has a preview, or when it is not a component. */
  hostNote: string | null;
  /** What the module really holds, read off the value: a component, an arity, a list's length. */
  signature: string | null;
  /** The value itself, for a constant or a list, so there is something to read rather than a name. */
  valueText: string | null;
  value: unknown;
  /** False when the export is in the namespace but has no record in the table, which the test fails on. */
  described: boolean;
};

type CatalogMeta = {
  category: CatalogCategory;
  summary: string;
  keywords?: string;
  renderable?: true;
  hostNote?: string;
};

const HOST_SESSION =
  "A host provides a session through the auth adapter; on its own it renders nothing.";
const HOST_PERMISSIONS =
  "Reads the permission rule from the provider above it, so there is nothing to decide without one.";

const CATALOG_META: Record<string, CatalogMeta> = {
  Button: {
    category: "Actions and buttons",
    summary: "The button every other action builds on, with the variants and sizes the package uses.",
    keywords: "press click submit cta variants sizes",
    renderable: true,
  },
  buttonVariants: {
    category: "Actions and buttons",
    summary: "The class recipe behind Button, for a host styling a link or a native element as one.",
    keywords: "classes tailwind recipe",
  },
  AdminSaveButton: {
    category: "Actions and buttons",
    summary: "A save action that reflects a form's dirty state rather than being told whether to.",
    keywords: "save dirty form",
    renderable: true,
  },
  AdminSubmitButton: {
    category: "Actions and buttons",
    summary: "The form's submit control, with the pending and disabled states applied to it.",
    keywords: "submit form send",
    renderable: true,
  },
  AdminPendingButton: {
    category: "Actions and buttons",
    summary: "A button that shows a spinner and refuses a second press while work is in flight.",
    keywords: "loading spinner busy in flight",
    renderable: true,
  },

  AdminField: {
    category: "Forms and fields",
    summary: "Label, hint, error and control in one field, wired to the control by id.",
    keywords: "label hint error validation",
    renderable: true,
  },
  AdminFieldGrid: {
    category: "Forms and fields",
    summary: "Lays fields out in columns that collapse to one on a narrow screen.",
    keywords: "grid columns layout",
    renderable: true,
  },
  AdminFormActions: {
    category: "Forms and fields",
    summary: "The action row at the end of a form, ordered for a phone first and a keyboard after.",
    keywords: "actions footer submit cancel",
    renderable: true,
  },
  AdminFormSection: {
    category: "Forms and fields",
    summary: "A titled group of fields inside a form, with a description of what belongs in it.",
    keywords: "section group fields form",
    renderable: true,
  },
  AdminManagedForm: {
    category: "Forms and fields",
    summary:
      "A form that owns its values, tracks what changed, and hands a dirty flag to its actions.",
    keywords: "managed dirty tracking values autosave",
    hostNote:
      "A managed form is driven by a field definition the host declares, and none of it is visible without one.",
  },
  AdminInput: {
    category: "Forms and fields",
    summary: "The package's text input, with the shared focus and error treatment.",
    keywords: "text input field",
    renderable: true,
  },
  AdminTextarea: {
    category: "Forms and fields",
    summary: "A multi-line input styled to match AdminInput.",
    keywords: "multiline textarea long text",
    renderable: true,
  },
  AdminSelect: {
    category: "Forms and fields",
    summary: "A native select styled to match the package's controls.",
    keywords: "dropdown options native",
    renderable: true,
  },
  adminInputClassName: {
    category: "Forms and fields",
    summary: "The input's class recipe, for a host rendering an input the package does not own.",
    keywords: "classes tailwind input",
  },
  AdminRepeaterListField: {
    category: "Forms and fields",
    summary: "A field that adds and removes rows of the same shape, stored as one newline value.",
    keywords: "repeater rows add remove list",
    renderable: true,
  },
  useAdminFormDirty: {
    category: "Forms and fields",
    summary: "Reports whether a managed form holds anything the host did not start with.",
    keywords: "dirty changed tracking",
  },
  useAdminFormValueSignal: {
    category: "Forms and fields",
    summary: "Bridges a control's value into a named field, and restores one when the form replays.",
    keywords: "value signal restore form",
  },
  ADMIN_FORM_VALUE_EVENT: {
    category: "Forms and fields",
    summary: "The event name a managed form listens for when another surface changes a value.",
    keywords: "event name broadcast",
  },
  ADMIN_FORM_ACTION_IDLE_STATE: {
    category: "Forms and fields",
    summary: "The action state meaning nothing is pending, so a host can compare against it.",
    keywords: "idle state action",
  },
  defaultAdminManagedFormFeedbackLabels: {
    category: "Forms and fields",
    summary: "The saving, saved and failed wording a managed form uses unless the host replaces it.",
    keywords: "labels feedback copy saving",
  },

  AdminTable: {
    category: "Data display",
    summary: "The table, with column definitions, alignment, selection and responsive row actions.",
    keywords: "table rows columns grid data",
    renderable: true,
  },
  AdminTableBulkActions: {
    category: "Data display",
    summary: "The bar that appears once rows are selected, counting them for the actions inside.",
    keywords: "bulk actions selected bar",
    renderable: true,
  },
  AdminTableRowActions: {
    category: "Data display",
    summary: "A row's actions, shown in place on a wide screen and behind a control on a narrow one.",
    keywords: "row actions overflow menu",
    renderable: true,
  },
  useAdminTableSelection: {
    category: "Data display",
    summary: "Holds which rows are selected, for a table wired to bulk actions.",
    keywords: "selection selected rows state",
  },
  AdminStatusPill: {
    category: "Data display",
    summary: "A small tone-coloured label for a record's state.",
    keywords: "pill badge status tone",
    renderable: true,
  },
  AdminSkeleton: {
    category: "Data display",
    summary: "A single shimmering placeholder, for a host laying out its own skeleton.",
    keywords: "placeholder loading shimmer",
    renderable: true,
  },
  AdminContentSkeleton: {
    category: "Data display",
    summary: "The package's standard skeleton for a page whose content is on its way.",
    keywords: "placeholder loading page",
    renderable: true,
  },
  AdminEmptyState: {
    category: "Data display",
    summary: "What a list shows when it has nothing: why, and the one action that changes it.",
    keywords: "empty nothing blank zero",
    renderable: true,
  },
  AdminStatCard: {
    category: "Data display",
    summary: "One figure with its label, its detail behind contextual help, and a tone.",
    keywords: "stat metric figure kpi",
    renderable: true,
  },
  AdminListItemCard: {
    category: "Data display",
    summary: "A card row for a list that is not tabular, with media, title, meta and actions.",
    keywords: "list card row item",
    renderable: true,
  },
  AdminPagination: {
    category: "Data display",
    summary: "Page controls with the range and the window of page numbers around the current one.",
    keywords: "paging pages next previous",
    renderable: true,
  },
  defaultPaginationLabels: {
    category: "Data display",
    summary: "The wording and page-window size the pagination uses unless the host replaces them.",
    keywords: "labels copy window",
  },

  AdminChartFrame: {
    category: "Charts",
    summary:
      "The card a chart lives in, holding loading, failed, empty and ready as four different facts so a chart itself decides nothing.",
    keywords: "frame card states loading empty error ready",
    renderable: true,
  },
  AdminTimeSeriesChart: {
    category: "Charts",
    summary:
      "Bars for a value per day, or lines for series read against each other, drawn as SVG on a fixed viewBox with a hover readout.",
    keywords: "time series bar line svg hover readout",
    renderable: true,
  },
  AdminRankChart: {
    category: "Charts",
    summary:
      "One row per thing with its bar against a labelled axis, built from elements rather than SVG so a long name truncates instead of overlapping.",
    keywords: "rank bar horizontal rows axis",
    renderable: true,
  },
  AdminChartTable: {
    category: "Charts",
    summary:
      "The values behind a chart as a real table, built from the same points the marks come from, so a screen reader can reach every number.",
    keywords: "table screen reader accessible values fallback",
    renderable: true,
  },
  adminChartTicks: {
    category: "Charts",
    summary:
      "Round tick values from zero up to a top never below the data, so a gridline is a number a reader can read off and repeat.",
    keywords: "ticks round gridline domain scale",
  },
  adminChartAxis: {
    category: "Charts",
    summary:
      "Those ticks with the top and the fraction a value sits at in the plot, which is what a chart is actually drawn from.",
    keywords: "axis top fraction plot scale",
  },
  adminChartLabelIndices: {
    category: "Charts",
    summary:
      "Which category labels to print: first, middle and last, returned as the indices the hidden table is built from too.",
    keywords: "labels indices categories tick",
  },
  adminFormatCents: {
    category: "Charts",
    summary: "Integer cents as money with every digit, for a headline, a readout or the hidden table.",
    keywords: "money cents format full value",
  },
  adminFormatCentsCompact: {
    category: "Charts",
    summary:
      "The same integer cents shortened, for an axis where several gridlines share the width of a card.",
    keywords: "money cents compact axis short",
  },
  adminFormatCount: {
    category: "Charts",
    summary: "A whole number of things, for a headline or a value beside a bar.",
    keywords: "count format number value",
  },
  adminFormatCountCompact: {
    category: "Charts",
    summary: "The same count shortened, for an axis over a count.",
    keywords: "count compact axis short",
  },
  adminChartFormatters: {
    category: "Charts",
    summary:
      "The pair a chart takes: every digit for a value and the short form for a tick, chosen by unit rather than declared twice.",
    keywords: "formatters value tick unit pair",
  },
  adminChartDayKey: {
    category: "Charts",
    summary:
      "The UTC day a timestamp falls on, read as a prefix so the answer does not depend on the server's timezone.",
    keywords: "day key utc timestamp prefix date",
  },
  adminChartDayRange: {
    category: "Charts",
    summary:
      "The day keys ending on a given day, stepped in UTC so a daylight-saving boundary neither skips nor repeats one.",
    keywords: "day range dates utc window period",
  },
  adminChartFillDays: {
    category: "Charts",
    summary:
      "One point per day including the zeros, so a day the store holds no row for reads as a gap rather than a line straight across it.",
    keywords: "fill days zero gap points series",
  },
  defaultAdminChartSeriesClasses: {
    category: "Charts",
    summary:
      "The fill and stroke pairs a chart colours series with, written out whole because Tailwind cannot compose a colour suffix.",
    keywords: "palette series colours classes default",
  },
  adminChartSeriesClasses: {
    category: "Charts",
    summary:
      "The pair for the nth series, wrapping around a palette the host may have handed in place of the default one.",
    keywords: "series classes index lookup palette nth",
  },
  defaultAdminChartFrameLabels: {
    category: "Charts",
    summary:
      "The five strings the frame uses when a host supplies none, where a partial override replaces only the keys it names.",
    keywords: "labels default strings frame wording",
  },

  AdminBanner: {
    category: "Overlays and feedback",
    summary: "A page-level message, with a tone, an icon, and an optional action.",
    keywords: "banner notice alert message",
    renderable: true,
  },
  AdminToastCard: {
    category: "Overlays and feedback",
    summary: "One transient message in the toast viewport.",
    keywords: "toast message transient notification",
    renderable: true,
  },
  AdminToastViewport: {
    category: "Overlays and feedback",
    summary: "The fixed corner the toasts stack in, and the region a screen reader announces from.",
    keywords: "toast viewport stack live region",
    renderable: true,
  },
  AdminDestructiveAction: {
    category: "Overlays and feedback",
    summary: "A delete that states what it will remove and asks for confirmation first.",
    keywords: "delete destructive confirm dialog",
    renderable: true,
  },
  AdminModal: {
    category: "Overlays and feedback",
    summary: "The dialog root: the open state, the focus trap, and the escape handling around it.",
    keywords: "dialog modal root open",
    renderable: true,
  },
  AdminModalTrigger: {
    category: "Overlays and feedback",
    summary: "The control that opens the dialog it sits inside.",
    keywords: "trigger open dialog",
    renderable: true,
  },
  AdminModalContent: {
    category: "Overlays and feedback",
    summary: "The dialog's surface, positioned and sized for a phone and for a desktop.",
    keywords: "content surface panel dialog",
    renderable: true,
  },
  AdminModalHeader: {
    category: "Overlays and feedback",
    summary: "The title and description block at the top of a dialog.",
    keywords: "header top dialog",
    renderable: true,
  },
  AdminModalTitle: {
    category: "Overlays and feedback",
    summary: "The dialog's accessible name.",
    keywords: "title name heading",
    renderable: true,
  },
  AdminModalDescription: {
    category: "Overlays and feedback",
    summary: "The sentence under the title that says what the dialog is for.",
    keywords: "description subtitle body",
    renderable: true,
  },
  AdminModalBody: {
    category: "Overlays and feedback",
    summary: "The scrollable middle of a dialog, where the form goes.",
    keywords: "body scroll content",
    renderable: true,
  },
  AdminModalFooter: {
    category: "Overlays and feedback",
    summary: "The dialog's action row, ordered for a phone first and a keyboard after.",
    keywords: "footer actions buttons",
    renderable: true,
  },
  AdminModalClose: {
    category: "Overlays and feedback",
    summary: "The control that closes the dialog it sits inside, without confirming anything.",
    keywords: "close dismiss cancel dialog",
    renderable: true,
  },
  Tooltip: {
    category: "Overlays and feedback",
    summary: "A short description shown on hover and on focus, for a control with no room for a label.",
    keywords: "tooltip hover hint",
    renderable: true,
  },
  TooltipProvider: {
    category: "Overlays and feedback",
    summary: "The provider the tooltips share, which also holds the delay before one appears.",
    keywords: "provider delay tooltip",
    renderable: true,
  },
  AdminContextualHelp: {
    category: "Overlays and feedback",
    summary: "The small help marker beside a label, revealing the detail that would not fit.",
    keywords: "help info marker detail",
    renderable: true,
  },
  AdminUrlFeedback: {
    category: "Overlays and feedback",
    summary: "Shows a message after a redirect by reading it from the query string.",
    keywords: "redirect query string flash message url",
    renderable: true,
  },

  AdminSortableDndContext: {
    category: "Sorting and reordering",
    summary: "The drag context a sortable list runs inside, carrying its sensors and announcements.",
    keywords: "drag dnd context sensors announcements",
    renderable: true,
  },
  AdminSortableCard: {
    category: "Sorting and reordering",
    summary: "A draggable card, used where the items being reordered are surfaces rather than rows.",
    keywords: "card drag sortable",
    renderable: true,
  },
  AdminSortableRow: {
    category: "Sorting and reordering",
    summary: "A draggable table row, carrying the transform and the drop indicator.",
    keywords: "row drag sortable table",
    renderable: true,
  },
  AdminSortableToast: {
    category: "Sorting and reordering",
    summary: "Confirms a reorder, or reports that it failed and offers a retry.",
    keywords: "reorder result confirmation",
    renderable: true,
  },
  AdminDragHandle: {
    category: "Sorting and reordering",
    summary: "The grip that starts a drag, labelled for a screen reader and a keyboard.",
    keywords: "handle grip drag keyboard",
    renderable: true,
  },
  useAdminSortableList: {
    category: "Sorting and reordering",
    summary: "Runs a reorder: the sensors, the ordered items, the end handler and the result toast.",
    keywords: "sortable list reorder hook sensors",
  },
  useIsDesktopViewport: {
    category: "Sorting and reordering",
    summary: "Whether the viewport is wide enough for a drag, rather than for a move control.",
    keywords: "viewport media query desktop",
  },
  defaultSortableMessages: {
    category: "Sorting and reordering",
    summary: "The announcements a reorder reads out while it is happening.",
    keywords: "labels announcements copy",
  },

  AdminSurfaceCard: {
    category: "Layout",
    summary: "The card surface the layout primitives share, for a host composing its own sections.",
    keywords: "card surface container",
    renderable: true,
  },
  AdminSectionCard: {
    category: "Layout",
    summary: "A titled section with an icon, a description and an action, on a card surface.",
    keywords: "section card title icon",
    renderable: true,
  },
  AdminSectionIntro: {
    category: "Layout",
    summary: "The same heading block without the card, for the top of a page.",
    keywords: "intro heading title page",
    renderable: true,
  },
  AdminFormCard: {
    category: "Layout",
    summary: "A card sized for a form, with room for the action row beneath the fields.",
    keywords: "form card surface",
    renderable: true,
  },
  AdminSplitFormLayout: {
    category: "Layout",
    summary: "Puts a form beside a summary that stays put while the form scrolls.",
    keywords: "split two column layout sticky",
    renderable: true,
  },
  dashboardGridClassName: {
    category: "Layout",
    summary: "The grid a dashboard arranges its tiles in, exported so a host can match it.",
    keywords: "grid classes dashboard",
  },
  cn: {
    category: "Layout",
    summary: "The class name joiner the package uses. It does not merge conflicting utilities.",
    keywords: "classname cn join",
  },

  AdminShell: {
    category: "Shell and navigation",
    summary: "The whole admin frame: sidebar, header, mobile navigation, search and content.",
    keywords: "shell layout frame chrome",
    hostNote:
      "The shell is the host. It is handed navigation, a session and a permissions adapter before it has anything to draw.",
  },
  AdminBreadcrumbs: {
    category: "Shell and navigation",
    summary: "The trail of the current page, read off the navigation groups and the pathname.",
    keywords: "breadcrumbs trail path",
    renderable: true,
  },
  AdminPageHeader: {
    category: "Shell and navigation",
    summary: "The title bar inside the shell, with the trail and a slot for the page's action.",
    keywords: "header title bar action",
    renderable: true,
  },
  AdminPageActionLink: {
    category: "Shell and navigation",
    summary: "A link styled as the page's primary action, for starting something rather than submitting.",
    keywords: "action link new create",
    renderable: true,
  },
  AdminNavLink: {
    category: "Shell and navigation",
    summary: "One navigation item, with its icon, its active state and its short label for a phone.",
    keywords: "nav link item active",
    renderable: true,
  },
  AdminMobileNav: {
    category: "Shell and navigation",
    summary: "The bottom navigation on a small screen, holding only the items marked as primary.",
    keywords: "mobile nav bottom bar phone",
    renderable: true,
  },
  AdminSearch: {
    category: "Shell and navigation",
    summary: "Search across the navigation and any extra entries the host adds.",
    keywords: "search find command palette",
    renderable: true,
  },
  AdminProfileMenu: {
    category: "Shell and navigation",
    summary: "The account menu: the session's email, the profile and site links, and sign-out.",
    keywords: "profile account menu logout",
    renderable: true,
  },
  AdminLoginScreen: {
    category: "Shell and navigation",
    summary: "The sign-in screen, with the labels, the busy state and the error the host passes in.",
    keywords: "login signin credentials form",
    renderable: true,
  },
  filterNavGroups: {
    category: "Shell and navigation",
    summary: "Drops the items and groups a role may not reach, and the groups left empty.",
    keywords: "nav filter role hidden",
  },
  flattenNavItems: {
    category: "Shell and navigation",
    summary: "Every item in the navigation, flattened out of its groups, in order.",
    keywords: "nav flatten items",
  },
  findNavItemAt: {
    category: "Shell and navigation",
    summary: "The navigation item that owns a pathname, preferring the most specific match.",
    keywords: "nav find match pathname active",
  },
  isActiveHref: {
    category: "Shell and navigation",
    summary: "Whether a navigation href is the current page or a page beneath it.",
    keywords: "active href current pathname",
  },
  isNavItemVisible: {
    category: "Shell and navigation",
    summary: "Whether a role may reach a navigation item, including its `roles` list.",
    keywords: "visible role permission nav",
  },
  resolveNavIcon: {
    category: "Shell and navigation",
    summary: "The icon a navigation item names, from the package's own icon set.",
    keywords: "icon name resolve",
  },
  getAdminHrefPathname: {
    category: "Shell and navigation",
    summary: "The pathname of an href, with the query and the fragment taken off.",
    keywords: "href pathname query strip",
  },
  useAdminHref: {
    category: "Shell and navigation",
    summary: "The locale-aware href builder, so a host writes one link for every locale.",
    keywords: "href locale prefix link",
  },
  useBreadcrumbs: {
    category: "Shell and navigation",
    summary: "Builds the trail for the current pathname, honouring the navigation's own labels.",
    keywords: "breadcrumbs trail hook",
  },
  useAdminSearchParams: {
    category: "Shell and navigation",
    summary: "The query string, read through the suspense boundary the page already has.",
    keywords: "search params query url",
  },
  useAdminShell: {
    category: "Shell and navigation",
    summary: "The shell context: the navigation, the current page and what the shell is holding.",
    keywords: "shell context navigation current page",
  },

  AdminAuthProvider: {
    category: "Auth and permissions",
    summary: "Holds the session and exposes sign-in and sign-out to the whole tree.",
    keywords: "auth session provider signin",
    hostNote: HOST_SESSION,
  },
  AdminRequireSession: {
    category: "Auth and permissions",
    summary: "Renders its children for a session, and the sign-in screen for a request without one.",
    keywords: "guard require session redirect",
    hostNote: HOST_SESSION,
  },
  AdminCan: {
    category: "Auth and permissions",
    summary: "Renders its children only when the session holds a named permission.",
    keywords: "can permission gate authorised",
    hostNote: HOST_PERMISSIONS,
  },
  AdminPermissionsProvider: {
    category: "Auth and permissions",
    summary: "Carries the permission rule so any `AdminCan` below it can ask the same question.",
    keywords: "permissions provider rule",
    hostNote: "The provider takes a permissions adapter from the host, and answers nothing without one.",
  },
  AdminProfilePage: {
    category: "Auth and permissions",
    summary: "The profile page: the session's own details and the password change.",
    keywords: "profile account password page",
    hostNote: "A page built on the host's profile adapter, which the catalogue has no reason to stand up.",
  },
  AdminSettingsPage: {
    category: "Auth and permissions",
    summary: "The settings page, laid out from a schema the host declares.",
    keywords: "settings page schema site",
    hostNote: "A page built on the host's settings adapter and schema, which the catalogue does not declare.",
  },
  adminReturnTo: {
    category: "Auth and permissions",
    summary: "The same-site path a sign-in should return to, or null when the request offers none.",
    keywords: "return next redirect safe",
  },
  useAdminSession: {
    category: "Auth and permissions",
    summary: "The session, its loading state, and the sign-in and sign-out it goes through.",
    keywords: "session user loading signin",
  },
  useAdminCan: {
    category: "Auth and permissions",
    summary: "Asks the permission rule about one named permission, and reruns when the session changes.",
    keywords: "can permission ask rule",
  },
  useAdminPermission: {
    category: "Auth and permissions",
    summary: "Asks the permission rule about one resource and operation, without a component.",
    keywords: "permission resource operation",
  },
  useAdminPermittedNav: {
    category: "Auth and permissions",
    summary: "The navigation with everything the session may not reach taken out of it.",
    keywords: "permitted nav filter role",
  },
  useAdminReturnTo: {
    category: "Auth and permissions",
    summary: "Where to send a session that just signed in, read from the request's query string.",
    keywords: "return next redirect",
  },
  evaluateAdminPermission: {
    category: "Auth and permissions",
    summary:
      "Asks the host's rule whether a session may perform a permission, and fails closed: no rule, no session and a rule that throws all deny.",
    keywords: "evaluate decide rule allow deny fails closed",
  },
  createAdminPermissionCheck: {
    category: "Auth and permissions",
    summary:
      "The check a view asks through, resolving the session per request and answering with the same rule a server action enforces.",
    keywords: "check can adapter session request server",
  },
  createAdminPermissionGuard: {
    category: "Auth and permissions",
    summary:
      "Hands back the session or throws, so a route, a page or an action refuses before the effect it protects runs.",
    keywords: "guard require throw redirect protect action",
  },
  AdminUnauthenticatedError: {
    category: "Auth and permissions",
    summary:
      "Thrown when the request carries no session, which the guard keeps distinct from a session that may not do this.",
    keywords: "unauthenticated no session error signin refuse",
    hostNote:
      "An error a server action or route throws to refuse a request. There is nothing to draw here: catch it, or turn it into the response a visitor sees.",
  },
  createAdminSessionGuard: {
    category: "Auth and permissions",
    summary:
      "Resolves the host's session on the server and refuses without one, so a route, a page or a server action protects itself in one call rather than repeating the read.",
    keywords: "guard require session server redirect protect unauthenticated",
  },
  readAdminSession: {
    category: "Auth and permissions",
    summary:
      "The same read without the refusal, answering null when nobody is signed in, so a route handler can return 401 rather than catch an exception.",
    keywords: "session read null 401 unauthorized optional guard",
  },
  adminLoginHref: {
    category: "Auth and permissions",
    summary:
      "Builds the sign-in link with a validated destination, so a guard redirects somewhere the sign-in page will actually honour.",
    keywords: "login signin href url next redirect destination",
  },
  AdminSessionRequiredError: {
    category: "Auth and permissions",
    summary:
      "Thrown when a guard's handler returns instead of throwing, so the work behind the guard is unreachable whether the host redirects or replies.",
    keywords: "error no session required refuse unauthenticated handler",
    hostNote:
      "An error a server action or route throws to refuse a request, and the fallback when a host's refusal handler returns rather than throwing. There is nothing to draw here: catch it, or turn it into the response a visitor sees.",
  },
  AdminPermissionDeniedError: {
    category: "Auth and permissions",
    summary:
      "Thrown when the rule refuses, carrying the reason the browser is never told, so a denial is diagnosable rather than only a no.",
    keywords: "denied forbidden error reason refuse",
    hostNote:
      "An error a server action throws to refuse a request, with the decision attached. There is nothing to draw here: catch it, or turn it into a forbidden response.",
  },

  CREDENTIAL_USERS_SCHEMA: {
    category: "Credentials and sessions",
    summary:
      "The users table as SQL to run once, with the address and role constraints in the database rather than only in the adapter.",
    keywords: "users table sql schema create password",
  },
  CREDENTIAL_SESSIONS_SCHEMA: {
    category: "Credentials and sessions",
    summary:
      "The sessions table as SQL, with expiry as a column so a session can be ended early rather than only left to lapse.",
    keywords: "sessions table sql schema expiry create",
  },
  hashPassword: {
    category: "Credentials and sessions",
    summary:
      "Derives a password into scrypt$salt$key, with the parameters travelling inside the value so they can be raised later without a migration.",
    keywords: "hash scrypt salt password derive",
  },
  verifyPassword: {
    category: "Credentials and sessions",
    summary:
      "Compares a password against a stored hash in constant time, and refuses a value this package did not write.",
    keywords: "verify compare scrypt timing safe check",
  },
  normalizeEmail: {
    category: "Credentials and sessions",
    summary:
      "The form an address is stored and looked up in, so a pasted or capitalised address still finds the row it belongs to.",
    keywords: "email normalize trim lower case lookup",
  },
  generateSessionSecret: {
    category: "Credentials and sessions",
    summary:
      "Mints the signing secret a session adapter needs, for a host to run once at install and keep in its environment.",
    keywords: "secret generate random sign hmac",
  },
  authenticate: {
    category: "Credentials and sessions",
    summary:
      "Decides who the credentials belong to, or refuses without saying which half was wrong, so a public login form is not an enumeration oracle.",
    keywords: "authenticate login signin credentials decoy",
  },
  createPersistenceCredentialStore: {
    category: "Credentials and sessions",
    summary:
      "The credential store over a persistence adapter the host already has, with the table and column names as options rather than a schema of ours.",
    keywords: "store persistence users sessions adapter columns",
  },
  createCredentialAuthAdapter: {
    category: "Credentials and sessions",
    summary:
      "The auth adapter over a user store and a session row, so a sign-out ends the row and not just this browser's copy of the cookie.",
    keywords: "auth adapter session cookie login logout revoke",
  },

  AdminDashboardLayout: {
    category: "Dashboard and widgets",
    summary: "The dashboard grid, taking states the host has already resolved. Server-safe.",
    keywords: "dashboard grid layout tiles server",
    renderable: true,
  },
  AdminDashboardTile: {
    category: "Dashboard and widgets",
    summary: "One tile: a placement, the widget it names, and that widget's state.",
    keywords: "tile placement widget grid",
    renderable: true,
  },
  AdminDashboardTiles: {
    category: "Dashboard and widgets",
    summary: "The loading half of the grid: it runs each tile's loader and shows the pending state.",
    keywords: "tiles loaders suspense dashboard",
    renderable: true,
  },
  AdminDashboardMissingTile: {
    category: "Dashboard and widgets",
    summary: "What a placement names that no widget answers for, with the reason it was refused.",
    keywords: "missing unknown widget problem",
    renderable: true,
  },
  AdminWidget: {
    category: "Dashboard and widgets",
    summary: "A widget that reads the active dictionary itself, for a client-side tile.",
    keywords: "widget client dictionary i18n",
    renderable: true,
  },
  AdminWidgetPanel: {
    category: "Dashboard and widgets",
    summary: "A widget as a tile, with the dictionary handed in, so a server component can render it.",
    keywords: "widget panel server title",
    renderable: true,
  },
  defineAdminWidget: {
    category: "Dashboard and widgets",
    summary: "Declares a widget: its id, title, sizes, empty check and how its data renders.",
    keywords: "define declare widget typed",
  },
  createAdminWidgetRegistry: {
    category: "Dashboard and widgets",
    summary: "Turns a map of declarations into the registry the dashboard resolves placements against.",
    keywords: "registry create widgets",
  },
  adminWidgetState: {
    category: "Dashboard and widgets",
    summary: "Wraps loaded data as the state a widget renders, applying its own empty check.",
    keywords: "state data ready empty",
  },
  adminWidgetBody: {
    category: "Dashboard and widgets",
    summary: "The branch on a widget's state: pending, failed, empty, or the rendered data.",
    keywords: "body branch state render",
  },
  adminWidgetSizes: {
    category: "Dashboard and widgets",
    summary: "Every size a tile may occupy, smallest first, for a host validating an arrangement.",
    keywords: "sizes list width",
  },
  adminWidgetLoadAll: {
    category: "Dashboard and widgets",
    summary: "Runs every placement's loader together and hands back one map of states.",
    keywords: "load all loaders batch",
  },
  useAdminWidgetData: {
    category: "Dashboard and widgets",
    summary: "Loads one widget's data, cancelling the request when the tile goes away.",
    keywords: "load data abort hook",
  },
  adminDashboardAddPlacement: {
    category: "Dashboard and widgets",
    summary: "Adds a tile at the smallest size its widget supports, rather than at a size you pick.",
    keywords: "add placement append tile",
  },
  adminDashboardCollection: {
    category: "Dashboard and widgets",
    summary: "The dashboard arrangement as a collection definition, so the editor can arrange it.",
    keywords: "collection definition arrange editor",
  },
  adminDashboardCopy: {
    category: "Dashboard and widgets",
    summary: "The wording the grid uses, filled in from the host's dictionary where it has any.",
    keywords: "copy messages labels grid",
  },
  adminDashboardProblems: {
    category: "Dashboard and widgets",
    summary: "Every way an arrangement disagrees with its registry, keyed by placement id.",
    keywords: "problems validation errors",
  },
  adminDashboardRemoveAt: {
    category: "Dashboard and widgets",
    summary: "Removes a placement by index, answering the arrangement without it.",
    keywords: "remove placement index",
  },
  adminDashboardSetSize: {
    category: "Dashboard and widgets",
    summary: "Resizes a placement, or refuses a size the widget does not support.",
    keywords: "resize size placement",
  },
  adminDashboardValidate: {
    category: "Dashboard and widgets",
    summary: "Checks a whole arrangement against its registry and reports what does not hold.",
    keywords: "validate arrangement registry",
  },
  adminStatWidget: {
    category: "Dashboard and widgets",
    summary:
      "A figure with a caption, coloured by its own trend: a rise reads good, a fall reads bad, and invertTrend swaps that for churn and error rates.",
    keywords: "stat figure kpi trend tile number tone colour",
    renderable: true,
  },
  adminTableWidget: {
    category: "Dashboard and widgets",
    summary:
      "A read-only table that works out from the data alone that a column is numbers, formats it and right-aligns it, then caps the rows and says how many it left out.",
    keywords: "table rows columns align right numeric cap truncated",
    renderable: true,
  },
  adminListWidget: {
    category: "Dashboard and widgets",
    summary:
      "A handful of ranked or recent rows, where a long label truncates and keeps its full text while the figure beside it holds its width.",
    keywords: "list rows ranked label truncate figure cap",
    renderable: true,
  },
  adminChartWidget: {
    category: "Dashboard and widgets",
    summary:
      "A host's rows as a time series on the package's own chart, deciding the formatters, the whole-number ticks and the sentence a screen reader reads instead of the drawing.",
    keywords: "chart time series bar line axis ticks aria screen reader",
    renderable: true,
  },
  adminRankWidget: {
    category: "Dashboard and widgets",
    summary:
      "A ranking on the package's rank chart, kept apart from the time series because the order is the claim: plotting ranked rows along a dated axis would say something false about them.",
    keywords: "rank ranking chart bars ordered top",
    renderable: true,
  },
  adminActivityWidget: {
    category: "Dashboard and widgets",
    summary:
      "A feed of what changed, owning the age thresholds a host gets subtly wrong and mapping each event's kind to a tone, so a failure is scannable rather than read.",
    keywords: "activity feed events recent ages timestamps tone",
    renderable: true,
  },
  adminActivityAge: {
    category: "Dashboard and widgets",
    summary:
      "How old an event is in words, with the thresholds stated once: just now under a minute, minutes under an hour, and the date itself past a week. Takes the clock to read against, so a feed's ages stay in step with the tile's.",
    keywords: "age relative time thresholds just now ago",
  },
  defaultAdminShippedWidgetLabels: {
    category: "Dashboard and widgets",
    summary:
      "The words the shipped tiles print themselves, as the sentences taking a count rather than as templates, so a host's language is never assembled by this package.",
    keywords: "labels words copy i18n translate sentences counts",
  },

  AdminCollectionEditor: {
    category: "Collections",
    summary: "The editor that arranges, reorders, duplicates and removes the entries of a collection.",
    keywords: "editor collection arrange entries",
    hostNote:
      "The editor is given a collection definition and its entries by the host, and shows nothing to edit without them.",
  },
  adminCollectionAdd: {
    category: "Collections",
    summary: "Appends an entry with the next id, and answers the collection that includes it.",
    keywords: "add entry append collection",
  },
  adminCollectionDuplicateAt: {
    category: "Collections",
    summary: "Copies the entry at an index, giving the copy a fresh id and placing it after the original.",
    keywords: "duplicate copy entry index",
  },
  adminCollectionEntryId: {
    category: "Collections",
    summary: "The id an entry has, whatever shape the host stores entries in.",
    keywords: "entry id identifier",
  },
  adminCollectionFirstProblem: {
    category: "Collections",
    summary: "The first entry that fails validation, so an editor can point at one row.",
    keywords: "first problem validation entry",
  },
  adminCollectionFormData: {
    category: "Collections",
    summary: "Reads a submitted collection editor form back into entries.",
    keywords: "formdata submit parse entries",
  },
  adminCollectionIds: {
    category: "Collections",
    summary: "Every entry id in order, which is what the drag announcements read out.",
    keywords: "ids list order",
  },
  adminCollectionMove: {
    category: "Collections",
    summary: "Moves an entry from one index to another and answers the new order.",
    keywords: "move reorder index drag",
  },
  adminCollectionNextId: {
    category: "Collections",
    summary: "An id no entry holds yet, so an added one cannot collide with an existing entry.",
    keywords: "next id fresh unique",
  },
  adminCollectionRemoveAt: {
    category: "Collections",
    summary: "Removes the entry at an index and answers the collection without it.",
    keywords: "remove delete index entry",
  },
  adminCollectionReorder: {
    category: "Collections",
    summary: "Applies a list of ids back onto the entries, dropping any id that is not there.",
    keywords: "reorder ids drag order",
  },
  adminCollectionShift: {
    category: "Collections",
    summary: "Moves an entry one place up or down, and answers whether anything moved.",
    keywords: "shift up down move",
  },
  adminCollectionValidate: {
    category: "Collections",
    summary: "Checks every entry against the definition and reports what each one got wrong.",
    keywords: "validate entries problems",
  },
  adminCollectionValues: {
    category: "Collections",
    summary: "The host's value type behind a collection, stripped of the bookkeeping the editor adds.",
    keywords: "values entries map type",
  },

  AdminMediaField: {
    category: "Media",
    summary: "A form field holding one asset, with a picker, a preview and an upload.",
    keywords: "field asset image picker",
    hostNote: "The picker it opens needs a media adapter, which is the host's own storage.",
  },
  AdminMediaGalleryField: {
    category: "Media",
    summary: "A form field holding a gallery of assets, with the same picker and upload.",
    keywords: "gallery field assets images",
    hostNote: "The picker it opens needs a media adapter, which is the host's own storage.",
  },
  AdminMediaPicker: {
    category: "Media",
    summary: "The searchable, sortable library of assets, with upload and external URL entry.",
    keywords: "picker library browse assets",
    hostNote: "It lists and uploads through a media adapter, so there is no library to show without one.",
  },
  AdminMediaUpload: {
    category: "Media",
    summary: "Drop a file or pick one, and hand the uploaded asset back to the host.",
    keywords: "upload drop file",
    hostNote: "Uploading goes through a media adapter, so there is nothing to show without one.",
  },
  AdminMediaPlaceholder: {
    category: "Media",
    summary: "What stands in for an asset that is missing, still loading, or not a visual kind.",
    keywords: "placeholder missing fallback asset",
    renderable: true,
  },
  AdminMediaAspectRatioHint: {
    category: "Media",
    summary: "The recommended ratio for a field that crops, shown before the picker is opened.",
    keywords: "aspect ratio hint crop",
    renderable: true,
  },
  adminMediaSortValues: {
    category: "Media",
    summary: "Every order the library can be sorted into, with the value each one is stored as.",
    keywords: "sort orders values library",
  },
  formatMediaSize: {
    category: "Media",
    summary: "A byte count as a size a person reads, in the locale it is given.",
    keywords: "bytes size format locale",
  },
  getAdminMediaThumbnailUrl: {
    category: "Media",
    summary: "The thumbnail for an asset, including the YouTube case where there is no upload.",
    keywords: "thumbnail image url preview",
  },
  getAdminMediaTimestamp: {
    category: "Media",
    summary: "An asset's date as a timestamp, or null when it carries no date at all.",
    keywords: "date timestamp created",
  },
  getYouTubeId: {
    category: "Media",
    summary: "The video id in a YouTube URL, or null when the URL is not a YouTube one.",
    keywords: "youtube id parse url",
  },
  getYouTubeThumbnailUrl: {
    category: "Media",
    summary: "The still image for a YouTube id, at the size the library shows.",
    keywords: "youtube thumbnail still url",
  },
  isImageMediaItem: {
    category: "Media",
    summary: "Whether an asset is one the library can show as a picture.",
    keywords: "image kind predicate",
  },
  isVideoMediaItem: {
    category: "Media",
    summary: "Whether an asset is an uploaded video rather than a YouTube one.",
    keywords: "video kind predicate",
  },
  isYouTubeMediaItem: {
    category: "Media",
    summary: "Whether an asset is a YouTube link rather than a file in storage.",
    keywords: "youtube kind predicate",
  },
  isPdfMediaItem: {
    category: "Media",
    summary: "Whether an asset is a document rather than something visual.",
    keywords: "pdf document kind predicate",
  },
  isVisualMediaItem: {
    category: "Media",
    summary: "Whether an asset is one the library shows a preview for, whatever its kind.",
    keywords: "visual preview kind predicate",
  },
  sortAdminMediaItems: {
    category: "Media",
    summary: "Puts assets in the library's order, which is why it takes the same value the store holds.",
    keywords: "sort order library items",
  },
  getMediaAspectRatioClassName: {
    category: "Media",
    summary: "The class that crops a preview to a field's aspect ratio, or nothing when there is none.",
    keywords: "aspect ratio class crop",
  },
  defaultAdminMediaLabels: {
    category: "Media",
    summary: "The wording every media surface uses unless the host replaces it.",
    keywords: "labels copy media wording",
  },

  AdminResourceList: {
    category: "Resources",
    summary: "The list for a declared resource: filters, a table, and the actions the rule allows.",
    keywords: "list table resource records",
    hostNote:
      "It is given a resource definition, its rows and a permissions adapter by the host, and has no records of its own.",
  },
  AdminResourceForm: {
    category: "Resources",
    summary: "The create and edit form for a declared resource, driven by its field definitions.",
    keywords: "form create edit resource",
    hostNote: "It is given a resource definition and a record by the host, and has no fields of its own.",
  },
  defineAdminResource: {
    category: "Resources",
    summary: "Declares a resource: its table, its fields, its filters and the operations it allows.",
    keywords: "define declare resource table fields",
  },
  adminResourceValues: {
    category: "Resources",
    summary: "Reads a submitted resource form back into a record, coercing each field's type.",
    keywords: "formdata values record parse",
  },
  adminResourcePath: {
    category: "Resources",
    summary: "The URL path a resource lives at, derived from its name when it declares none.",
    keywords: "path url route derive",
  },
  adminResourceRecordId: {
    category: "Resources",
    summary: "The id of a record, whether the host stores it as a string, a number or an object.",
    keywords: "record id identifier",
  },
  absentRequired: {
    category: "Resources",
    summary: "The required fields a record is missing, which is what an import should refuse on.",
    keywords: "required missing validation import",
  },
  createAdminResourceActions: {
    category: "Resources",
    summary:
      "The five resource calls a client makes, each refusing through a guard before the store is reached, so a name from the browser is never a capability on its own.",
    keywords: "actions server guard persistence boundary capability",
  },
  AdminResourceNotExposedError: {
    category: "Resources",
    summary:
      "Thrown when a request names a resource this admin does not expose, whatever the session behind it may do.",
    keywords: "not exposed error resource refuse unknown",
    hostNote:
      "An error the resource actions throw before the store is reached. There is nothing to draw here: catch it, or turn it into a not-found response.",
  },

  AdminI18nProvider: {
    category: "Internationalisation",
    summary: "Supplies the dictionary, the content locale and the href builder to the whole tree.",
    keywords: "i18n dictionary locale provider",
    renderable: true,
  },
  useAdminMessages: {
    category: "Internationalisation",
    summary: "The active dictionary, resolved from the provider or from the default locale.",
    keywords: "messages dictionary copy hook",
  },
  useAdminContentLocale: {
    category: "Internationalisation",
    summary: "The locale the content is written in, which is not always the locale of the interface.",
    keywords: "content locale editor language",
  },
  useAdminLocaleAdapter: {
    category: "Internationalisation",
    summary: "The host's own locale handling, so the package defers to it rather than routing for you.",
    keywords: "locale adapter host routing",
  },
  defineAdminMessages: {
    category: "Internationalisation",
    summary: "Declares a dictionary, and answers the compile error when a key is missing from it.",
    keywords: "define messages dictionary typed",
  },
  getAdminMessages: {
    category: "Internationalisation",
    summary: "The dictionary for a locale tag, falling back to English for one it has never seen.",
    keywords: "get messages locale lookup",
  },
  mergeAdminLabels: {
    category: "Internationalisation",
    summary: "Fills the gaps in one label set from another, which is how a host overrides part of it.",
    keywords: "merge labels override partial",
  },
  defaultAdminLabels: {
    category: "Internationalisation",
    summary: "The English wording every surface falls back to when a host supplies no dictionary.",
    keywords: "default labels english fallback",
  },
  defaultAdminLocale: {
    category: "Internationalisation",
    summary: "The locale the package assumes when the host does not name one.",
    keywords: "default locale fallback",
  },
  englishAdminMessages: {
    category: "Internationalisation",
    summary: "The built-in English dictionary, which the other locales are written against.",
    keywords: "english messages dictionary built in",
  },
  turkishAdminMessages: {
    category: "Internationalisation",
    summary: "The built-in Turkish dictionary, and the proof the dictionary shape is translatable.",
    keywords: "turkish messages dictionary locale",
  },

  normalizeHex: {
    category: "Theme and colour",
    summary: "A colour as the six-digit hex the rest of the colour helpers accept.",
    keywords: "hex colour normalize",
  },
  contrastingTextHex: {
    category: "Theme and colour",
    summary: "Black or white, whichever reads on the colour it is given.",
    keywords: "contrast text readable colour",
  },
  lightenHex: {
    category: "Theme and colour",
    summary: "A colour mixed towards white, for a hover state on a themed surface.",
    keywords: "lighten mix white hover",
  },
  darkenHex: {
    category: "Theme and colour",
    summary: "A colour mixed towards black, for a pressed state on a themed surface.",
    keywords: "darken mix black pressed",
  },
  mixHex: {
    category: "Theme and colour",
    summary: "Two colours blended by a weight, which is how a brand colour becomes a surface.",
    keywords: "mix blend weight colour",
  },
  useAdminBranding: {
    category: "Theme and colour",
    summary: "Turns a brand accent into the inline custom properties the themed surfaces read.",
    keywords: "branding accent custom properties theme",
  },
  contrastRatio: {
    category: "Theme and colour",
    summary:
      "The WCAG ratio between two hex colours, and null when either cannot be read, so an unreadable value fails a decision instead of scoring zero on it.",
    keywords: "contrast wcag ratio luminance accessibility",
  },
  ADMIN_TEXT_CONTRAST: {
    category: "Theme and colour",
    summary: "The 4.5:1 the theme holds every text pair to, which is WCAG 1.4.3 for normal text.",
    keywords: "contrast threshold wcag accessibility 4.5",
  },
  ADMIN_SURFACES: {
    category: "Theme and colour",
    summary:
      "The two surfaces per colour mode a brand text colour has to stay readable on, mirrored from the token layer so the two cannot drift.",
    keywords: "surfaces light dark background readable",
  },
  ADMIN_RESOURCE_MAX_LIMIT: {
    category: "Resources",
    summary:
      "The largest window a query may ask for, so a host implementing the contract has a ceiling to enforce rather than invent.",
    keywords: "limit max window page size ceiling cap",
  },
  adminResourceQuery: {
    category: "Resources",
    summary:
      "Builds a query that is valid by construction, so a host writing the query half of the contract does not assemble one by hand and hope.",
    keywords: "build query builder search filter sort window",
  },
  parseAdminResourceQuery: {
    category: "Resources",
    summary:
      "Reads an unknown value as a query or refuses it, which is what a host needs to answer whether a value really is one before it reaches a store.",
    keywords: "parse validate query refuse unknown shape",
  },
  ADMIN_BRAND_VARIABLES: {
    category: "Theme and colour",
    summary: "The five custom properties a host accent fills in, which is the whole of the brand surface.",
    keywords: "brand variables properties names tokens",
  },
  adminBrandVariables: {
    category: "Theme and colour",
    summary:
      "The brand token values a host accent produces, or null when no label colour clears 4.5:1 on it, because the default palette is then the better answer.",
    keywords: "brand variables accent contrast reject refuse",
  },
  describeAccentRejection: {
    category: "Theme and colour",
    summary:
      "Why an accent was refused and the best ratio either label colour reached on it, so the message can advise rather than only decline.",
    keywords: "reject refuse reason ratio explain accent",
  },
  ADMIN_DENSITIES: {
    category: "Theme and colour",
    summary: "The three density steps a host picks between, ordered tightest to loosest so a select reads in order.",
    keywords: "density compact comfortable spacious steps",
  },
  ADMIN_DENSITY_SCALE: {
    category: "Theme and colour",
    summary:
      "The multiplier behind each density, unitless because the token feeds a calc, with comfortable left at 1 so an admin changes nothing by default.",
    keywords: "density scale multiplier spacing calc",
  },
  ADMIN_DENSITY_VARIABLE: {
    category: "Theme and colour",
    summary:
      "The custom property the token layer and the Tailwind spacing remap both read, so one write moves the whole package.",
    keywords: "density variable custom property css spacing",
  },
  DEFAULT_ADMIN_DENSITY: {
    category: "Theme and colour",
    summary: "The density that renders what the package rendered before density was a setting at all.",
    keywords: "default density comfortable fallback",
  },
  adminDensityScale: {
    category: "Theme and colour",
    summary: "The multiplier for one density name, which is what the settings layer writes onto the document.",
    keywords: "density scale multiplier value lookup",
  },
  isAdminDensity: {
    category: "Theme and colour",
    summary: "Whether a value that arrived from a form is one of the three density names, rather than near one.",
    keywords: "density guard validate check form",
  },
  ADMIN_THEME_SETTING_KEYS: {
    category: "Theme and colour",
    summary:
      "The only two keys a host's settings object may carry, so a column nobody meant to add is reported rather than silently ignored.",
    keywords: "settings keys allow shape stray",
  },
  DEFAULT_ADMIN_THEME_SETTINGS: {
    category: "Theme and colour",
    summary:
      "What a host gets by setting nothing: the default density, and a null accent, which keeps the contrast-checked palette in tokens.css standing.",
    keywords: "default settings accent palette tokens fallback",
  },
  resolveAdminThemeSettings: {
    category: "Theme and colour",
    summary:
      "Validates a host's settings and reports what it could not use, replacing each with the default so one bad row cannot leave an admin with no theme.",
    keywords: "resolve validate settings problems default",
  },
  adminThemeSettingsStyle: {
    category: "Theme and colour",
    summary:
      "The custom properties a host's settings produce, with a refused accent contributing nothing at all rather than overriding a palette that works.",
    keywords: "style properties css settings inline",
  },
  useAdminThemeSettings: {
    category: "Theme and colour",
    summary: "The settings as they were applied, and the problems that came out of them, defaulting outside a provider.",
    keywords: "settings applied problems hook density accent",
  },
  AdminThemeSettingsProvider: {
    category: "Theme and colour",
    summary:
      "Puts a host's density and accent on the document as custom properties, and removes them again on the way out, so the whole package follows one setting.",
    keywords: "provider settings density accent document apply",
    renderable: true,
  },

  createSessionAuthAdapter: {
    category: "Adapters",
    summary: "The session adapter over a store the host owns. Reached at `@yesvus/helmdeck/baseline`.",
    keywords: "session auth adapter baseline",
  },
  createMemoryPersistenceAdapter: {
    category: "Adapters",
    summary: "A persistence adapter that keeps everything in memory, for a test or a demo.",
    keywords: "persistence memory adapter baseline",
  },
  createSqlitePersistenceAdapter: {
    category: "Adapters",
    summary: "A persistence adapter over SQLite, which is what the demo's own store runs on.",
    keywords: "persistence sqlite libsql adapter baseline",
  },
  createAuditAdapter: {
    category: "Adapters",
    summary: "Records what changed and who changed it, for a host that has to answer for it later.",
    keywords: "audit history changes baseline",
  },
  createCacheAdapter: {
    category: "Adapters",
    summary: "A cache the resource layer reads through, so a repeated list does not repeat its query.",
    keywords: "cache memoise query baseline",
  },
};

function kindOf(name: string): CatalogKind {
  if (/^use[A-Z]/.test(name)) return "hook";
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return "constant";
  if (/^[A-Z]/.test(name)) return "component";
  return "function";
}

/** Read off the value rather than asserted, so a renamed function's arity cannot go stale here. */
function signatureOf(value: unknown): string | null {
  if (typeof value === "function") {
    const arity = (value as (...args: never[]) => unknown).length;
    return `function of ${arity}`;
  }
  if (Array.isArray(value)) return `${value.length} values`;
  if (value !== null && typeof value === "object") return "object";
  return `${typeof value}: ${String(value).slice(0, 40)}`;
}

function valueTextOf(value: unknown): string | null {
  if (typeof value === "function") return null;
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value) || (value !== null && typeof value === "object")) {
    return JSON.stringify(value, null, 1);
  }
  return String(value);
}

function describe(entryPoint: CatalogEntryPoint, name: string, value: unknown): CatalogEntry {
  const kind = kindOf(name);
  const meta = CATALOG_META[name];
  return {
    name,
    entryPoint,
    kind,
    category: meta?.category ?? null,
    summary: meta?.summary ?? "No description yet.",
    searchText: [name, meta?.summary ?? "", meta?.keywords ?? "", kind].join(" ").toLowerCase(),
    // Read off the table rather than off the kind, because a widget factory is a lowercase function
    // that renders perfectly well once the catalogue has a preview for it. The kind decides what a
    // card can show when there is no preview, not whether one is possible.
    renderable: meta?.renderable === true,
    hostNote: kind === "component" ? (meta?.hostNote ?? null) : null,
    signature: kind === "component" ? null : signatureOf(value),
    valueText: kind === "component" ? null : valueTextOf(value),
    value,
    described: meta !== undefined,
  };
}

export const componentCatalog: CatalogEntry[] = [
  ...Object.entries(rootExports).map(([name, value]) => describe(".", name, value)),
  ...Object.entries(baselineExports).map(([name, value]) => describe("./baseline", name, value)),
].sort((a, b) => a.name.localeCompare(b.name));

export const catalogSummary = {
  total: componentCatalog.length,
  described: componentCatalog.filter((entry) => entry.described).length,
  renderable: componentCatalog.filter((entry) => entry.renderable).length,
  byCategory: CATALOG_CATEGORIES.map((category) => ({
    category,
    count: componentCatalog.filter((entry) => entry.category === category).length,
  })),
};

export type CatalogQuery = { query?: string; category?: CatalogCategory | null };

/**
 * Every whitespace-separated term has to match somewhere in the entry, so adding a word narrows
 * the list rather than widening it.
 */
export function searchCatalog(entries: CatalogEntry[], { query, category }: CatalogQuery): CatalogEntry[] {
  const terms = (query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (category && entry.category !== category) return false;
    return terms.every((term) => entry.searchText.includes(term));
  });
}
