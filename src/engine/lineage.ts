import type { ProvenanceIndex, ProvenanceNode } from './types';

export function visibleAt(graph: ProvenanceIndex, step: number): (id: string) => boolean {
  return (id) => {
    const n = graph[id];
    return !!n && n.stepCreated <= step;
  };
}

export function ancestors(graph: ProvenanceIndex, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [...(graph[id]?.parentIds ?? [])];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (out.has(cur) || !graph[cur]) continue;
    out.add(cur);
    stack.push(...graph[cur].parentIds);
  }
  return out;
}

export function childrenIndex(graph: ProvenanceIndex, upToStep = Infinity): Map<string, string[]> {
  const kids = new Map<string, string[]>();
  for (const n of Object.values(graph)) {
    if (n.stepCreated > upToStep) continue;
    for (const p of new Set(n.parentIds)) {
      const list = kids.get(p);
      if (list) list.push(n.id);
      else kids.set(p, [n.id]);
    }
  }
  return kids;
}

export function descendants(graph: ProvenanceIndex, id: string, upToStep = Infinity): Set<string> {
  const kids = childrenIndex(graph, upToStep);
  const out = new Set<string>();
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(kids.get(cur) ?? []));
  }
  return out;
}

export function sourceRoots(graph: ProvenanceIndex, id: string): ProvenanceNode[] {
  const all = [id, ...ancestors(graph, id)];
  return all.map((x) => graph[x]).filter((n): n is ProvenanceNode => !!n && n.stepCreated === 0);
}

export interface BiographyEntry {
  node: ProvenanceNode;
  relation: 'ancestor' | 'self' | 'descendant';
  depth: number;
}

function depths(graph: ProvenanceIndex, start: string, next: (id: string) => string[]): Map<string, number> {
  const d = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const n of next(cur)) {
      if (!d.has(n) && graph[n]) {
        d.set(n, (d.get(cur) as number) + 1);
        queue.push(n);
      }
    }
  }
  return d;
}

export function biography(graph: ProvenanceIndex, id: string, upToStep = Infinity): BiographyEntry[] {
  const self = graph[id];
  if (!self) return [];
  const up = depths(graph, id, (x) => graph[x]?.parentIds ?? []);
  const kids = childrenIndex(graph, upToStep);
  const down = depths(graph, id, (x) => kids.get(x) ?? []);
  const entries: BiographyEntry[] = [];
  up.forEach((dist, nid) => {
    if (nid !== id) entries.push({ node: graph[nid], relation: 'ancestor', depth: -dist });
  });
  entries.push({ node: self, relation: 'self', depth: 0 });
  down.forEach((dist, nid) => {
    if (nid !== id && graph[nid].stepCreated <= upToStep) entries.push({ node: graph[nid], relation: 'descendant', depth: dist });
  });
  const rank = { ancestor: 0, self: 1, descendant: 2 } as const;
  return entries.sort(
    (a, b) =>
      rank[a.relation] - rank[b.relation] ||
      a.node.stepCreated - b.node.stepCreated ||
      a.depth - b.depth ||
      a.node.id.localeCompare(b.node.id, undefined, { numeric: true }),
  );
}

export function projectedEdges(
  graph: ProvenanceIndex,
  nodes: Iterable<string>,
  visible: Set<string>,
  allowParent: (id: string) => boolean = () => true,
): [string, string][] {
  const edges = new Map<string, [string, string]>();
  const nearest = new Map<string, string[]>();
  const nearestVisible = (id: string, depth: number): string[] => {
    const memo = nearest.get(id);
    if (memo) return memo;
    const out: string[] = [];
    if (depth < 60) {
      for (const p of new Set(graph[id]?.parentIds ?? [])) {
        if (visible.has(p)) out.push(p);
        else out.push(...nearestVisible(p, depth + 1));
      }
    }
    const uniq = [...new Set(out)];
    nearest.set(id, uniq);
    return uniq;
  };
  for (const child of nodes) {
    if (!visible.has(child)) continue;
    for (const p of nearestVisible(child, 0)) {
      if (p !== child && allowParent(p)) edges.set(`${p}->${child}`, [p, child]);
    }
  }
  return [...edges.values()];
}
