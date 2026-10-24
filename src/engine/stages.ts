import { prettyString } from './pretty';
import { isValue } from './values';
import type { Cell, CellStatus, Expr, HofNode, StageRow, StepSnapshot } from './types';

const BUILTIN_ARG_LABELS: Record<string, string[]> = {
  map: ['fn', 'input'],
  filter: ['predicate', 'input'],
  fold: ['fn', 'initial acc', 'input'],
  reverse: ['input'],
  zip: ['left input', 'right input'],
  range: ['start', 'end'],
  fst: ['pair'],
  snd: ['pair'],
};

export function cellOf(e: Expr, status: CellStatus = 'idle'): Cell {
  switch (e.kind) {
    case 'num':
    case 'bool':
      return { type: 'value', id: e.meta.id, value: e.value, status };
    case 'list':
      return { type: 'row', id: e.meta.id, cells: e.items.map((x) => cellOf(x, status)), status };
    case 'tuple':
      return { type: 'tuple', id: e.meta.id, items: e.items.map((x) => cellOf(x, status)), status };
    case 'hof':
      return { type: 'row', id: e.meta.id, cells: hofCells(e).cells, status, label: e.label };
    default:
      return { type: 'expr', id: e.meta.id, text: prettyString(e, 44), status };
  }
}

function hofCells(h: HofNode): { cells: Cell[]; acc?: Cell; accExpr?: string } {
  if (h.op === 'map') {
    const cells: Cell[] = [
      ...h.results.map((r) => cellOf(r, 'done')),
      cellOf(h.current, 'active'),
      ...h.source.slice(h.index + 1).map((s) => cellOf(s, 'pending')),
    ];
    return { cells };
  }
  if (h.op === 'filter') {
    const cells = h.source.map((s, i) =>
      cellOf(s, i < h.index ? (h.verdicts[i] ? 'kept' : 'dropped') : i === h.index ? 'active' : 'pending'),
    );
    return { cells, accExpr: `test: ${prettyString(h.current, 40)}` };
  }
  const cells = h.source.map((s, i) => cellOf(s, i < h.index ? 'consumed' : i === h.index ? 'active' : 'pending'));
  const done = isValue(h.current);
  const acc = done ? cellOf(h.current, 'active') : cellOf(h.acc as Expr, 'active');
  return { cells, acc, accExpr: done ? undefined : prettyString(h.current, 44) };
}

function is2DCells(cells: Cell[]): boolean {
  return (
    cells.some((c) => c.type === 'row') &&
    cells.every(
      (c) => c.type === 'expr' || (c.type === 'row' && c.cells.every((x) => x.type === 'expr' || (x.type === 'value' && typeof x.value === 'number'))),
    )
  );
}

export function collectStages(expr: Expr, step: number): StageRow[] {
  const rows: StageRow[] = [];
  const seen = new Set<string>();
  const scalars: Cell[] = [];
  const scalarIds = new Set<string>();

  const visit = (e: Expr, hint?: string): void => {
    switch (e.kind) {
      case 'num':
      case 'bool':
        if (e !== expr && !scalarIds.has(e.meta.id)) {
          scalarIds.add(e.meta.id);
          scalars.push(cellOf(e));
        }
        return;
      case 'guard':
        visit(e.cond);
        visit(e.body, hint);
        return;
      case 'list': {
        if (seen.has(e.meta.id)) return;
        seen.add(e.meta.id);
        const cells = e.items.map((x) => cellOf(x));
        rows.push({
          key: e.meta.id,
          label: hint && e.origin ? `${hint} · ${e.origin}` : hint ?? e.origin ?? 'list',
          kind: 'list',
          cells,
          is2D: is2DCells(cells),
          firstStep: step,
        });
        e.items.forEach((x) => {
          if (x.kind !== 'list' && x.kind !== 'num' && x.kind !== 'bool' && x.kind !== 'tuple') visit(x);
        });
        return;
      }
      case 'hof': {
        if (seen.has(e.meta.id)) return;
        seen.add(e.meta.id);
        const { cells, acc, accExpr } = hofCells(e);
        rows.push({ key: e.meta.id, label: e.label, kind: e.op, cells, acc, accExpr, is2D: is2DCells(cells), firstStep: step });
        return;
      }
      case 'tuple':
        e.items.forEach((x) => visit(x, hint));
        return;
      case 'app': {
        if (e.fn.kind !== 'lam') visit(e.fn);
        const labels = e.fn.kind === 'builtin' ? BUILTIN_ARG_LABELS[e.fn.name] : undefined;
        e.args.forEach((a, i) => visit(a, labels ? `${(e.fn as { name: string }).name} · ${labels[i]}` : hint));
        return;
      }
      case 'binop':
        visit(e.left, hint);
        visit(e.right, hint);
        return;
      case 'if':
        visit(e.cond);
        return;
      case 'let':
        visit(e.value, e.name);
        visit(e.body, hint);
        return;
      default:
        return;
    }
  };
  visit(expr);

  if (scalars.length) {
    rows.unshift({ key: 'values', label: 'values', kind: 'values', cells: scalars, is2D: false, firstStep: step });
  }
  if (expr.kind === 'num' || expr.kind === 'bool') {
    rows.push({ key: 'result', label: 'result', kind: 'result', cells: [cellOf(expr, 'done')], is2D: false, firstStep: step });
  }
  return rows;
}

export interface TimelineRow extends StageRow {
  alive: boolean;
  lastStep: number;
  isOutput: boolean;
}

export function buildStageTimeline(history: StepSnapshot[], k: number): TimelineRow[] {
  const byKey = new Map<string, TimelineRow>();
  const order: string[] = [];
  const last = Math.min(k, history.length - 1);
  for (let s = 0; s <= last; s++) {
    for (const row of history[s].visualStages) {
      const prev = byKey.get(row.key);
      if (!prev) {
        order.push(row.key);
        byKey.set(row.key, { ...row, firstStep: s, alive: false, lastStep: s, isOutput: false });
      } else if (row.kind === 'values') {
        const have = new Set(prev.cells.map((c) => c.id));
        const cells = [...prev.cells, ...row.cells.filter((c) => !have.has(c.id))];
        byKey.set(row.key, { ...prev, cells, lastStep: s });
      } else {
        byKey.set(row.key, { ...row, label: prev.label, kind: prev.kind, firstStep: prev.firstStep, alive: false, lastStep: s, isOutput: false });
      }
    }
  }
  const snap = history[last];
  const outKey = snap && isValue(snap.expr) ? (snap.expr.kind === 'num' || snap.expr.kind === 'bool' ? 'result' : snap.expr.meta.id) : '';
  return order
    .map((key) => byKey.get(key) as TimelineRow)
    .filter((r) => r.kind !== 'result' || r.lastStep === last)
    .map((r) => ({ ...r, alive: r.lastStep === last, isOutput: r.key === outKey && r.lastStep === last }));
}

export function cellIds(c: Cell, out: string[] = []): string[] {
  if (c.type === 'value') out.push(c.id);
  else if (c.type === 'tuple') c.items.forEach((x) => cellIds(x, out));
  else if (c.type === 'row') c.cells.forEach((x) => cellIds(x, out));
  return out;
}
