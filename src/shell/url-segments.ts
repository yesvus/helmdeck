// SPDX-License-Identifier: MIT

export type AdminUrlHierarchyNode = {
  segment: string;
  label: string;
  children?: readonly AdminUrlHierarchyNode[];
};

export type AdminUrlRecordContext = {
  segment: string;
  id: string;
  label?: string;
};

export type AdminResolvedUrlHierarchy = {
  pathname: string;
  search: string;
  hash: string;
  crumbs: { label: string; href: string; current?: boolean }[];
  recordId?: string;
};

export function buildAdminUrlPath(
  nodes: readonly AdminUrlHierarchyNode[],
  record?: AdminUrlRecordContext,
): string {
  const segments = nodes.map(({ segment }) => cleanSegment(segment));
  if (record) segments.push(cleanSegment(record.segment));
  return `/${segments.join("/")}`;
}

export function resolveAdminUrlHierarchy(
  url: string,
  config: readonly AdminUrlHierarchyNode[],
  recordPattern: RegExp = /^\d+$/,
): AdminResolvedUrlHierarchy | null {
  const parsed = new URL(url, "https://helmdeck.invalid");
  const segments = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const crumbs: AdminResolvedUrlHierarchy["crumbs"] = [];
  let nodes = config;
  let consumed = 0;
  for (const segment of segments) {
    const match = nodes.find((node) => cleanSegment(node.segment) === segment);
    if (!match) break;
    consumed += 1;
    const href = `/${segments.slice(0, consumed).map(encodeURIComponent).join("/")}`;
    crumbs.push({ label: match.label, href, current: consumed === segments.length });
    nodes = match.children ?? [];
  }

  if (consumed < segments.length) {
    const terminal = segments.at(-1)!;
    const parentNodes = consumed === 0 ? config : findChildren(config, segments.slice(0, consumed));
    const sibling = parentNodes?.find((node) => cleanSegment(node.segment) === terminal);
    if (!sibling && consumed === segments.length - 1 && recordPattern.test(terminal)) {
      const id = terminal;
      const href = `/${segments.map(encodeURIComponent).join("/")}`;
      crumbs.push({ label: id, href, current: true });
      return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash, crumbs, recordId: id };
    }
    if (consumed === 0) return null;
    for (let index = consumed; index < segments.length; index += 1) {
      const segment = segments[index];
      const href = `/${segments.slice(0, index + 1).map(encodeURIComponent).join("/")}`;
      crumbs.push({ label: segment, href, current: index === segments.length - 1 });
    }
  }
  if (crumbs.length === 0) return null;
  crumbs.forEach((crumb, index) => { crumb.current = index === crumbs.length - 1; });
  return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash, crumbs };
}

function findChildren(nodes: readonly AdminUrlHierarchyNode[], segments: readonly string[]): readonly AdminUrlHierarchyNode[] | undefined {
  let current = nodes;
  for (const segment of segments) {
    const match = current.find((node) => cleanSegment(node.segment) === segment);
    if (!match) return undefined;
    current = match.children ?? [];
  }
  return current;
}

function cleanSegment(segment: string): string {
  const cleaned = segment.replace(/^\/+|\/+$/g, "");
  if (!cleaned || cleaned.includes("/")) throw new TypeError("A hierarchy segment must be one non-empty path segment");
  return cleaned;
}
