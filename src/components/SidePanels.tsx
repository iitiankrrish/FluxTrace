import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, RotateCcw, X } from 'lucide-react';
import { boxColors } from '../engine/colors';
import type { BiographyEntry } from '../engine/lineage';
import { fmtNum } from '../engine/pretty';
import type { Patch, ProvenanceNode } from '../engine/types';

const fmtVal = (v: ProvenanceNode['value']) => (typeof v === 'number' ? fmtNum(v) : String(v));

function MiniBox({ node, big = false }: { node: ProvenanceNode; big?: boolean }) {
  const scalar = typeof node.value === 'number' || typeof node.value === 'boolean';
  const c = scalar ? boxColors(node.value as number | boolean) : { fill: '#efece5', border: '#dcdbd6', text: '#4a4f5a' };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border font-mono font-semibold ${big ? 'h-11 min-w-[3.25rem] px-2 text-base' : 'h-7 min-w-[2.2rem] px-1.5 text-[11px]'}`}
      style={{ background: c.fill, borderColor: c.border, color: c.text }}
    >
      <span className="max-w-[9rem] truncate">{fmtVal(node.value)}</span>
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-8 text-center text-[13px] leading-relaxed text-ink-500">{children}</div>;
}

interface LineageProps {
  selected: ProvenanceNode | null;
  bio: BiographyEntry[];
  step: number;
  onSelect: (id: string) => void;
  onJump: (step: number) => void;
}

const REL_STYLE: Record<BiographyEntry['relation'], { dot: string; label: string }> = {
  ancestor: { dot: 'bg-sky-line', label: 'came from' },
  self: { dot: 'bg-ink-800', label: 'selected' },
  descendant: { dot: 'bg-peach-line', label: 'fed into' },
};

export function LineagePanel({ selected, bio, step, onSelect, onJump }: LineageProps) {
  const roots = useMemo(() => bio.filter((b) => b.relation === 'ancestor' && b.node.stepCreated === 0 && b.node.span), [bio]);
  if (!selected) return <EmptyHint>Click any box on the stage, or any number in the output, to see where it came from and what it fed into.</EmptyHint>;
  let lastRel: BiographyEntry['relation'] | null = null;
  return (
    <div className="scroll-thin flex-1 overflow-auto p-4">
      <div className="mb-4 flex items-center gap-3">
        <MiniBox node={selected} big />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{selected.rule}</div>
          <div className="truncate font-mono text-[11px] text-ink-600">{selected.formula}</div>
          <div className="mt-0.5 text-[11px] text-ink-500">
            created at step {selected.stepCreated}
            {selected.span ? ` · line ${selected.span.line}` : ''} · {selected.id}
          </div>
        </div>
      </div>
      {selected.role && <p className="mb-3 text-[12px] text-ink-600">Source literal: {selected.role.description}.</p>}
      {roots.length > 0 && (
        <p className="mb-4 text-[12px] leading-relaxed text-ink-600">
          Depends on {roots.length} source literal{roots.length === 1 ? '' : 's'}:{' '}
          {roots.map((r, i) => (
            <span key={r.node.id}>
              <button type="button" onClick={() => onSelect(r.node.id)} className="font-mono text-ink-900 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-700" title={r.node.role?.description}>
                {fmtVal(r.node.value)}
              </button>
              <span className="text-ink-400"> (line {r.node.span?.line})</span>
              {i < roots.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      )}
      <ol className="space-y-1.5">
        {bio.map((b) => {
          const header = b.relation !== lastRel ? REL_STYLE[b.relation].label : null;
          lastRel = b.relation;
          return (
            <li key={`${b.relation}-${b.node.id}`}>
              {header && b.relation !== 'self' && <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{header}</div>}
              <div className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${b.relation === 'self' ? 'border-ink-700 bg-paper' : 'border-ink-100 hover:border-ink-200'} ${b.node.stepCreated > step ? 'opacity-50' : ''}`}>
                <span className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${REL_STYLE[b.relation].dot}`} />
                <button type="button" onClick={() => onSelect(b.node.id)} title="Select this value">
                  <MiniBox node={b.node} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium">{b.node.rule}</div>
                  <div className="truncate font-mono text-[10px] text-ink-500" title={b.node.formula}>
                    {b.node.formula}
                  </div>
                  {b.node.placements.length > 0 && <div className="truncate text-[10px] text-ink-500">placed in {b.node.placements.join(' · ')}</div>}
                </div>
                <button type="button" className="chip shrink-0 border border-ink-200 text-ink-600 hover:bg-paper-2" onClick={() => onJump(b.node.stepCreated)} title="Go to the step that created this value">
                  step {b.node.stepCreated}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface SolverProps {
  selected: ProvenanceNode | null;
  isFinal: boolean;
  target: string;
  onTarget: (v: string) => void;
  onSolve: () => void;
  patches: Patch[] | null;
  solveFor: string | null;
  onApply: (p: Patch) => void;
  canUndo: boolean;
  onUndo: () => void;
  focusToken: number;
}

export function SolverPanel({ selected, isFinal, target, onTarget, onSolve, patches, solveFor, onApply, canUndo, onUndo, focusToken }: SolverProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (focusToken > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusToken]);

  const verified = patches?.filter((p) => p.verified) ?? [];
  const rejected = patches?.filter((p) => !p.verified) ?? [];

  return (
    <div className="scroll-thin flex flex-1 flex-col overflow-auto p-4">
      {canUndo && (
        <button type="button" className="btn mb-3 self-start" onClick={onUndo}>
          <RotateCcw className="h-3 w-3" /> Undo last patch
        </button>
      )}
      {!selected || selected.kind !== 'num' ? (
        <EmptyHint>Pick a number on the stage (double-click jumps straight here), then enter the value you want it to have. The solver works backwards to find which source literal to change.</EmptyHint>
      ) : (
        <>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSolve();
            }}
          >
            <MiniBox node={selected} />
            <span className="text-ink-400">should be</span>
            <input
              ref={inputRef}
              value={target}
              onChange={(e) => onTarget(e.target.value)}
              inputMode="decimal"
              className="w-24 rounded-md border border-ink-300 bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-ink-700"
              aria-label="Desired value"
            />
            <button type="submit" className="btn btn-solid">
              Solve backwards
            </button>
          </form>
          <p className="mt-1.5 text-[11px] text-ink-500">{isFinal ? 'This is the final output of the program.' : `Intermediate value created at step ${selected.stepCreated}.`}</p>

          {patches && solveFor === selected.id && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-ink-600">
                <span>
                  {verified.length} verified patch{verified.length === 1 ? '' : 'es'}
                </span>
                {rejected.length > 0 && (
                  <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-ink-900" onClick={() => setShowRejected((v) => !v)}>
                    {showRejected ? 'hide' : 'show'} {rejected.length} rejected
                  </button>
                )}
              </div>
              {verified.length === 0 && <p className="rounded-md border border-butter-line bg-butter/60 p-2 text-[12px] text-butter-ink">No single-literal edit produces that value. Try another target.</p>}
              {[...verified, ...(showRejected ? rejected : [])].map((p, i) => (
                <div key={p.id} className={`rounded-md border p-2.5 ${p.verified ? 'border-ink-200' : 'border-rose-line/70 bg-rose/30'}`}>
                  <div className="flex items-start gap-2">
                    {p.verified ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage-ink" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-ink" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold">
                        Patch {i + 1}: {p.title} <span className="font-normal text-ink-500">(line {p.line})</span>
                      </div>
                      <div className="truncate text-[11px] text-ink-500">{p.description}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-ink-600">
                        re-run gives {p.achievedValue === null ? 'n/a' : fmtNum(p.achievedValue)} · output {p.newOutput}
                      </div>
                      {i === 0 && p.verified && p.score > 0 && <div className="mt-1 inline-block rounded bg-sage px-1.5 py-0.5 text-[10px] font-medium text-sage-ink">most plausible</div>}
                    </div>
                    {p.verified && (
                      <button type="button" className="btn btn-solid shrink-0 !py-1" onClick={() => onApply(p)}>
                        Apply
                      </button>
                    )}
                  </div>
                  {p.chain.length > 0 && (
                    <button type="button" className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-900" onClick={() => setOpen(open === p.id ? null : p.id)}>
                      {open === p.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} how it was derived ({p.chain.length} steps)
                    </button>
                  )}
                  {open === p.id && (
                    <ol className="mt-1 space-y-0.5 border-l-2 border-ink-100 pl-2">
                      {p.chain.map((c, k) => (
                        <li key={k} className="font-mono text-[10px] text-ink-600">
                          <span className="text-ink-400">{c.rule}:</span> {c.explanation}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
