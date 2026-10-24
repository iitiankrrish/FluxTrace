import { createContext, memo, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Grid3x3, Rows3 } from 'lucide-react';
import { boxColors, pixelShade } from '../engine/colors';
import { fmtNum } from '../engine/pretty';
import { cellIds, type TimelineRow } from '../engine/stages';
import type { Cell } from '../engine/types';

export interface StageInteraction {
  selectedId: string | null;
  ancestorsSet: Set<string>;
  descendantsSet: Set<string>;
  flashIds: Set<string>;
  onSelect: (id: string | null) => void;
  onSolve: (id: string) => void;
}

const Ctx = createContext<StageInteraction | null>(null);
const useStage = () => useContext(Ctx) as StageInteraction;

function lineageClass(id: string, s: StageInteraction): string {
  if (!s.selectedId) return '';
  if (id === s.selectedId) return 'outline outline-2 outline-offset-2 outline-ink-900 z-10';
  if (s.ancestorsSet.has(id)) return 'outline outline-2 outline-offset-1 outline-sky-ink';
  if (s.descendantsSet.has(id)) return 'outline-dashed outline-2 outline-offset-1 outline-peach-ink';
  return 'opacity-30';
}

const STATUS_BADGE: Partial<Record<Cell['status'], { text: string; cls: string }>> = {
  consumed: { text: '✓', cls: 'bg-lilac text-lilac-ink border-lilac-line' },
  kept: { text: '✓', cls: 'bg-sage text-sage-ink border-sage-line' },
  dropped: { text: '✗', cls: 'bg-rose text-rose-ink border-rose-line' },
};

function ValueBox({ cell, row, size = 'md' }: { cell: Extract<Cell, { type: 'value' }>; row: number; size?: 'md' | 'sm' }) {
  const s = useStage();
  const v = cell.value;
  const isNum = typeof v === 'number';
  const text = isNum ? fmtNum(v) : v ? 'true' : 'false';
  const c = boxColors(v);
  const flash = s.flashIds.has(cell.id);
  const status = cell.status;
  const active = status === 'active';
  const badge = STATUS_BADGE[status];
  const dims = size === 'sm' ? 'h-8 min-w-[2.25rem] px-1.5 text-[12px]' : 'h-11 min-w-[3rem] px-2 text-[14px]';
  const statusCls =
    active
      ? 'border-2 !border-ink-800 shadow-lift'
      : status === 'pending'
        ? 'border-dashed opacity-50'
        : status === 'consumed' || status === 'dropped'
          ? 'opacity-50'
          : '';
  return (
    <motion.button
      layout
      type="button"
      data-pid={cell.id}
      data-row={row}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: active ? -3 : 0, scale: flash ? [1, 1.15, 1] : 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      title={`${text} · ${status}${isNum ? ' · double-click to solve backwards' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        s.onSelect(cell.id === s.selectedId ? null : cell.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isNum) s.onSolve(cell.id);
      }}
      className={`relative flex items-center justify-center rounded-md border font-mono font-semibold tabular-nums transition-opacity duration-200 ${dims} ${statusCls} ${lineageClass(cell.id, s)}`}
      style={{ background: flash ? '#d8eadc' : c.fill, borderColor: flash ? '#3f6b4c' : c.border, color: c.text }}
    >
      <span className={status === 'dropped' ? 'line-through' : ''}>{text}</span>
      {badge && <span className={`absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold ${badge.cls}`}>{badge.text}</span>}
    </motion.button>
  );
}

function ExprBox({ cell }: { cell: Extract<Cell, { type: 'expr' }> }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: cell.status === 'active' ? 1 : 0.6, y: cell.status === 'active' ? -3 : 0 }}
      exit={{ opacity: 0 }}
      className={`flex h-11 max-w-[16rem] items-center rounded-md bg-butter px-2.5 font-mono text-[12px] text-butter-ink ${cell.status === 'active' ? 'border-2 border-ink-800 shadow-lift' : 'border border-butter-line'}`}
      title={cell.text}
    >
      <span className="truncate">{cell.text}</span>
    </motion.div>
  );
}

const CellView = memo(function CellView({ cell, row, size = 'md' }: { cell: Cell; row: number; size?: 'md' | 'sm' }) {
  if (cell.type === 'value') return <ValueBox cell={cell} row={row} size={size} />;
  if (cell.type === 'expr') return <ExprBox cell={cell} />;
  const items = cell.type === 'tuple' ? cell.items : cell.cells;
  const [open, close] = cell.type === 'tuple' ? ['(', ')'] : ['[', ']'];
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: cell.status === 'pending' ? 0.55 : 1 }}
      className={`flex items-center gap-1 rounded-md px-1.5 py-1 ${cell.status === 'active' ? 'border-2 border-ink-800 bg-paper' : 'border border-ink-200 bg-paper/60'}`}
    >
      <span className="font-mono text-xs text-ink-400">{open}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((c, i) => (
          <CellView key={`${c.id}-${i}`} cell={c} row={row} size="sm" />
        ))}
      </AnimatePresence>
      <span className="font-mono text-xs text-ink-400">{close}</span>
    </motion.div>
  );
});

function PixelGrid({ cells, row }: { cells: Cell[]; row: number }) {
  const s = useStage();
  const nums: number[] = [];
  cells.forEach((c) => {
    if (c.type === 'row') c.cells.forEach((x) => x.type === 'value' && typeof x.value === 'number' && nums.push(x.value));
  });
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums, 1);
  const cols = Math.max(1, ...cells.map((c) => (c.type === 'row' ? c.cells.length : 1)));
  return (
    <div className="inline-grid gap-1 rounded-md border border-ink-200 bg-paper-2 p-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(2.75rem, 3.5rem))` }}>
      {cells.map((r, ri) =>
        r.type === 'row' ? (
          r.cells.map((c, ci) => {
            if (c.type !== 'value' || typeof c.value !== 'number') {
              return (
                <div key={`${ri}-${ci}`} className="flex aspect-square items-center justify-center rounded border-2 border-ink-800 bg-butter p-1 text-center font-mono text-[9px] leading-tight text-butter-ink">
                  {c.type === 'expr' ? c.text : '…'}
                </div>
              );
            }
            const shade = pixelShade(c.value, min, max);
            const active = c.status === 'active';
            const pending = c.status === 'pending' || r.status === 'pending';
            return (
              <motion.button
                layout
                type="button"
                key={`${c.id}-${ri}-${ci}`}
                data-pid={c.id}
                data-row={row}
                onClick={(e) => {
                  e.stopPropagation();
                  s.onSelect(c.id === s.selectedId ? null : c.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  s.onSolve(c.id);
                }}
                animate={{ opacity: pending ? 0.35 : 1 }}
                className={`relative flex aspect-square items-end justify-end rounded p-1 font-mono text-[10px] font-semibold ${lineageClass(c.id, s)} ${active ? 'border-2 border-ink-800' : ''}`}
                style={{ background: s.flashIds.has(c.id) ? '#d8eadc' : shade.fill, color: shade.text }}
                title={`${fmtNum(c.value)} · double-click to solve backwards`}
              >
                {fmtNum(c.value)}
              </motion.button>
            );
          })
        ) : (
          <div key={`x-${ri}`} className="flex items-center justify-center rounded border-2 border-ink-800 bg-butter px-2 py-3 font-mono text-[10px] text-butter-ink" style={{ gridColumn: `span ${cols}` }}>
            {r.type === 'expr' ? r.text : '…'}
          </div>
        ),
      )}
    </div>
  );
}

interface Path {
  d: string;
  kind: 'up' | 'down';
  key: string;
}

const ARROW_COLOR = { up: '#3d5f86', down: '#b08560' };

function LineageOverlay({ containerRef, edges, depsKey }: { containerRef: RefObject<HTMLDivElement>; edges: { from: string; to: string; kind: 'up' | 'down' }[]; depsKey: string }) {
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const pos = (n: Element) => {
        const r = n.getBoundingClientRect();
        return { x: r.left - base.left + el.scrollLeft + r.width / 2, top: r.top - base.top + el.scrollTop, bottom: r.bottom - base.top + el.scrollTop, row: Number((n as HTMLElement).dataset.row ?? 0) };
      };
      const find = (id: string) => Array.from(el.querySelectorAll(`[data-pid="${id}"]`));
      const out: Path[] = [];
      for (const e of edges) {
        const kids = find(e.to);
        const parents = find(e.from);
        if (!kids.length || !parents.length) continue;
        const kid = pos(kids[kids.length - 1]);
        const candidates = parents.map(pos).filter((p) => p.row <= kid.row);
        const above = candidates.filter((p) => p.row < kid.row);
        const par = (above.length ? above[above.length - 1] : candidates[candidates.length - 1]) ?? pos(parents[0]);
        let d: string;
        if (par.row === kid.row) {
          const drop = 22 + Math.min(30, Math.abs(kid.x - par.x) / 8);
          d = `M ${par.x} ${par.bottom} C ${par.x} ${par.bottom + drop}, ${kid.x} ${kid.bottom + drop}, ${kid.x} ${kid.bottom}`;
        } else if (par.bottom <= kid.top) {
          const dy = Math.max(24, (kid.top - par.bottom) / 2);
          d = `M ${par.x} ${par.bottom} C ${par.x} ${par.bottom + dy}, ${kid.x} ${kid.top - dy}, ${kid.x} ${kid.top}`;
        } else {
          const dy = Math.max(24, (par.top - kid.bottom) / 2);
          d = `M ${par.x} ${par.top} C ${par.x} ${par.top - dy}, ${kid.x} ${kid.bottom + dy}, ${kid.x} ${kid.bottom}`;
        }
        out.push({ d, kind: e.kind, key: `${e.from}->${e.to}` });
      }
      setPaths(out);
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    measure();
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 450);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
    };
  }, [containerRef, edges, depsKey]);

  if (!paths.length) return null;
  return (
    <svg className="pointer-events-none absolute left-0 top-0 z-20" width={size.w} height={size.h} aria-hidden>
      <defs>
        {(['up', 'down'] as const).map((k) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill={ARROW_COLOR[k]} />
          </marker>
        ))}
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={ARROW_COLOR[p.kind]}
          strokeOpacity={p.kind === 'up' ? 0.85 : 0.7}
          strokeWidth={1.5}
          strokeDasharray={p.kind === 'down' ? '4 4' : undefined}
          markerEnd={`url(#arrow-${p.kind})`}
        />
      ))}
    </svg>
  );
}

const KIND_STYLE: Record<TimelineRow['kind'], string> = {
  list: 'bg-sky text-sky-ink',
  map: 'bg-sky text-sky-ink',
  filter: 'bg-rose text-rose-ink',
  fold: 'bg-lilac text-lilac-ink',
  result: 'bg-sage text-sage-ink',
  values: 'bg-butter text-butter-ink',
};

function RowCard({ row, index, gridView, onToggleGrid }: { row: TimelineRow; index: number; gridView: boolean; onToggleGrid: () => void }) {
  const s = useStage();
  const inLineage =
    !!s.selectedId && [...row.cells.flatMap((c) => cellIds(c)), ...(row.acc ? cellIds(row.acc) : [])].some((id) => id === s.selectedId || s.ancestorsSet.has(id) || s.descendantsSet.has(id));
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: row.alive || inLineage ? 1 : 0.6, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-lg border bg-white p-3 ${row.isOutput ? 'border-ink-700' : 'border-ink-200'}`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`chip ${KIND_STYLE[row.kind]}`}>{row.isOutput ? 'output' : row.kind}</span>
        <h3 className="max-w-[24rem] truncate font-mono text-xs text-ink-800 [font-variant-ligatures:none]" title={row.label}>
          {row.label}
        </h3>
        <span className="text-[10px] text-ink-400">
          step {row.firstStep}
          {row.lastStep !== row.firstStep ? `–${row.lastStep}` : ''}
        </span>
        {row.is2D && (
          <button type="button" className="btn btn-ghost ml-auto !px-1.5 !py-0.5 text-[11px] text-ink-600" onClick={onToggleGrid} title="Switch between row view and pixel grid">
            {gridView ? <Rows3 className="h-3.5 w-3.5" /> : <Grid3x3 className="h-3.5 w-3.5" />}
            {gridView ? 'Rows' : 'Grid'}
          </button>
        )}
      </header>
      <div className="flex flex-wrap items-center gap-3">
        {row.kind === 'fold' && row.acc && (
          <div className="flex items-center gap-2 rounded-md bg-lilac/60 px-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-lilac-ink">acc</span>
            <CellView cell={row.acc} row={index} />
            {row.accExpr && <span className="max-w-[14rem] truncate font-mono text-[11px] text-lilac-ink">← {row.accExpr}</span>}
          </div>
        )}
        {gridView && row.is2D ? (
          <PixelGrid cells={row.cells} row={index} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {row.cells.length === 0 && <span className="font-mono text-xs text-ink-400">[ ] (empty)</span>}
            <AnimatePresence mode="popLayout" initial={false}>
              {row.cells.map((c, i) => (
                <div key={`${c.id}-${i}`} className="flex flex-col items-center gap-1">
                  <CellView cell={c} row={index} />
                  {row.kind !== 'result' && <span className="font-mono text-[9px] text-ink-300">{i}</span>}
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}
        {row.kind === 'filter' && row.accExpr && <span className="font-mono text-[11px] text-rose-ink">{row.accExpr}</span>}
      </div>
    </motion.section>
  );
}

interface StageProps {
  rows: TimelineRow[];
  interaction: StageInteraction;
  edges: { from: string; to: string; kind: 'up' | 'down' }[];
  stepIndex: number;
  defaultGrid: boolean;
  gridOverrides: Record<string, boolean>;
  onToggleGrid: (rowKey: string, value: boolean) => void;
}

export function Stage({ rows, interaction, edges, stepIndex, defaultGrid, gridOverrides, onToggleGrid }: StageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const depsKey = `${stepIndex}|${interaction.selectedId}|${rows.length}|${JSON.stringify(gridOverrides)}|${defaultGrid}`;
  return (
    <Ctx.Provider value={interaction}>
      <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2">
          <span className="panel-title">Data flow</span>
          {interaction.selectedId ? (
            <span className="flex items-center gap-3 text-[10px] text-ink-500">
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-4 bg-sky-ink" /> came from
              </span>
              <span className="flex items-center gap-1">
                <span className="h-0 w-4 border-t-2 border-dashed border-peach-ink" /> fed into
              </span>
            </span>
          ) : (
            <span className="text-[10px] text-ink-400">click a box to trace it · double-click to solve backwards</span>
          )}
        </div>
        <div ref={ref} className="scroll-thin relative min-h-[260px] flex-1 overflow-auto bg-paper/50 p-4" onClick={() => interaction.onSelect(null)}>
          <div className="flex flex-col gap-4">
            {rows.length === 0 && <div className="p-6 text-center text-sm text-ink-400">No lists yet. Rows appear here once a list exists.</div>}
            {rows.map((row, i) => {
              const grid = gridOverrides[row.key] ?? defaultGrid;
              return <RowCard key={row.key} row={row} index={i} gridView={grid} onToggleGrid={() => onToggleGrid(row.key, !grid)} />;
            })}
          </div>
          <LineageOverlay containerRef={ref} edges={edges} depsKey={depsKey} />
        </div>
      </div>
    </Ctx.Provider>
  );
}
