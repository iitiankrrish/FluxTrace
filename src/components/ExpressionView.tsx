import { memo, useMemo } from 'react';
import { tree, type PNode } from '../engine/pretty';
import type { ProvenanceIndex, StepSnapshot } from '../engine/types';

interface Props {
  snapshot: StepSnapshot;
  totalSteps: number;
  lineage: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  provenance: ProvenanceIndex;
}

const Node = memo(function Node({
  n,
  nextId,
  activeId,
  lineage,
  selectedId,
  onSelect,
  provenance,
}: {
  n: PNode | string;
  nextId: string | null;
  activeId: string | null;
  lineage: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  provenance: ProvenanceIndex;
}) {
  if (typeof n === 'string') return <>{n}</>;
  const children = n.children.map((c, i) => (
    <Node key={i} n={c} nextId={nextId} activeId={activeId} lineage={lineage} selectedId={selectedId} onSelect={onSelect} provenance={provenance} />
  ));
  const classes: string[] = [];
  if (n.cls) classes.push(`ex-${n.cls}`);
  const isNext = !!n.id && n.id === nextId;
  const isActive = !!n.id && n.id === activeId;
  if (isNext) classes.push('rounded-sm bg-butter');
  if (isActive) classes.push('rounded-sm bg-sage');
  const clickable = !!n.id && !!provenance[n.id] && (n.cls === 'num' || n.cls === 'bool');
  if (clickable && n.id && lineage.has(n.id)) classes.push('underline decoration-sky-ink decoration-2 underline-offset-4');
  if (clickable && n.id === selectedId) classes.push('rounded-sm outline outline-2 outline-ink-800');
  if (clickable) classes.push('cursor-pointer hover:bg-paper-2 rounded-sm');
  if (classes.length === 0 && !clickable) return <>{children}</>;
  return (
    <span
      className={classes.join(' ')}
      data-ex-id={n.id}
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation();
              onSelect(n.id as string);
            }
          : undefined
      }
    >
      {children}
    </span>
  );
});

export function ExpressionView({ snapshot, totalSteps, lineage, selectedId, onSelect, provenance }: Props) {
  const t = useMemo(() => tree(snapshot.expr), [snapshot.expr]);
  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-100 px-4 py-2 text-xs">
        <span className="panel-title">Output</span>
        <span className="font-mono text-ink-500">
          step {snapshot.stepIndex}/{totalSteps}
        </span>
        <span className="font-medium text-ink-800">{snapshot.activeRule}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-ink-500">{snapshot.formula}</span>
        <span className="flex items-center gap-2 text-[10px] text-ink-500">
          <span className="rounded-sm bg-butter px-1">next</span>
          <span className="rounded-sm bg-sage px-1">just changed</span>
        </span>
      </div>
      <pre className="scroll-thin max-h-48 min-h-[72px] overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-6 text-ink-900 [font-variant-ligatures:none]">
        <Node
          n={t}
          nextId={snapshot.nextRedexId}
          activeId={snapshot.activeRedexId}
          lineage={lineage}
          selectedId={selectedId}
          onSelect={onSelect}
          provenance={provenance}
        />
      </pre>
    </div>
  );
}
