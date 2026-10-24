import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeEditor } from './components/CodeEditor';
import { DocsPanel } from './components/DocsPanel';
import { ExpressionView } from './components/ExpressionView';
import { LineagePanel, SolverPanel } from './components/SidePanels';
import { Stage, type StageInteraction } from './components/Stage';
import { SPEEDS, TimelineDrawer } from './components/Timeline';
import { solveBackward } from './engine/backwardSolver';
import { ancestors, biography, descendants, projectedEdges } from './engine/lineage';
import { fmtNum } from './engine/pretty';
import { buildStageTimeline, cellIds, type TimelineRow } from './engine/stages';
import { run } from './engine/stepper';
import type { Patch, RunResult, Span } from './engine/types';

const EMPTY = new Set<string>();

interface ProgramFile {
  id: string;
  name: string;
  code: string;
}

const STORAGE_KEY = 'fluxtrace.files.v2';
const NEW_TAB_CODE = '// write your code\n';
const seedFiles = (): ProgramFile[] => [{ id: 'file-1', name: 'untitled-1.hs', code: NEW_TAB_CODE }];

function loadFiles(): { files: ProgramFile[]; activeId: string } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { files: ProgramFile[]; activeId: string };
      if (Array.isArray(saved.files) && saved.files.length && saved.files.every((f) => typeof f.code === 'string' && typeof f.name === 'string')) {
        return { files: saved.files, activeId: saved.files.some((f) => f.id === saved.activeId) ? saved.activeId : saved.files[0].id };
      }
    }
  } catch {}
  const files = seedFiles();
  return { files, activeId: files[0].id };
}

type Tab = 'code' | 'lineage' | 'solver' | 'docs';
const TABS: { id: Tab; label: string }[] = [
  { id: 'code', label: 'Code' },
  { id: 'lineage', label: 'Lineage' },
  { id: 'solver', label: 'Counterfactual' },
  { id: 'docs', label: 'Docs' },
];

export default function App() {
  const [initial] = useState(loadFiles);
  const [files, setFiles] = useState<ProgramFile[]>(initial.files);
  const [activeId, setActiveId] = useState(initial.activeId);
  const code = files.find((f) => f.id === activeId)?.code ?? '';
  const setCode = useCallback((c: string) => setFiles((fs) => fs.map((f) => (f.id === activeId ? { ...f, code: c } : f))), [activeId]);
  const [debounced, setDebounced] = useState(code);
  const [undoStacks, setUndoStacks] = useState<Record<string, string[]>>({});
  const undoStack = undoStacks[activeId] ?? [];
  const setUndoStack = (fn: (u: string[]) => string[]) => setUndoStacks((m) => ({ ...m, [activeId]: fn(m[activeId] ?? []) }));
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<Tab>('code');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gridOverrides, setGridOverrides] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState('');
  const [patches, setPatches] = useState<Patch[] | null>(null);
  const [solveFor, setSolveFor] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [flashSpan, setFlashSpan] = useState<{ start: number; end: number } | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(EMPTY);
  const [toast, setToast] = useState<string | null>(null);
  const pendingJump = useRef<'start' | 'end' | 'keep'>('start');
  const prevResult = useRef<RunResult | null>(null);

  useEffect(() => {
    if (code === debounced) return;
    const t = window.setTimeout(() => setDebounced(code), 320);
    return () => window.clearTimeout(t);
  }, [code, debounced]);

  const result = useMemo(() => run(debounced), [debounced]);
  const history = result.history;
  const last = Math.max(0, history.length - 1);

  useEffect(() => {
    const prev = prevResult.current;
    const jump = pendingJump.current;
    pendingJump.current = 'keep';
    prevResult.current = result;
    if (jump === 'start') setStep(0);
    else if (jump === 'end') setStep(last);
    else setStep((s) => Math.min(s, last));
    if (prev && jump === 'end') {
      const changed = new Set<string>();
      for (const [id, n] of Object.entries(result.provenance)) {
        const old = prev.provenance[id];
        if (old && old.value !== n.value) changed.add(id);
      }
      setFlashIds(changed);
      const t = window.setTimeout(() => setFlashIds(EMPTY), 1600);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [result, last]);

  const clampedStep = Math.min(step, last);
  const snapshot = history[clampedStep];

  useEffect(() => {
    if (!playing) return;
    if (clampedStep >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStep((s) => Math.min(s + 1, last)), SPEEDS[speed].ms);
    return () => window.clearTimeout(t);
  }, [playing, clampedStep, last, speed]);

  const goto = useCallback((n: number) => setStep(Math.max(0, Math.min(last, n))), [last]);

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (clampedStep >= last) setStep(0);
    setPlaying(true);
  }, [playing, clampedStep, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') goto(clampedStep + 1);
      else if (e.key === 'ArrowLeft') goto(clampedStep - 1);
      else if (e.key === 'Home') goto(0);
      else if (e.key === 'End') goto(last);
      else if (e.key === 't' || e.key === 'T') setDrawerOpen((o) => !o);
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goto, togglePlay, clampedStep, last]);

  const rows = useMemo<TimelineRow[]>(() => (history.length ? buildStageTimeline(history, clampedStep) : []), [history, clampedStep]);
  const provenance = result.provenance;
  const selected = selectedId ? provenance[selectedId] ?? null : null;

  const ancestorsSet = useMemo(() => (selectedId && selected ? ancestors(provenance, selectedId) : EMPTY), [provenance, selectedId, selected]);
  const descendantsSet = useMemo(() => (selectedId && selected ? descendants(provenance, selectedId, clampedStep) : EMPTY), [provenance, selectedId, selected, clampedStep]);
  const lineage = useMemo(() => new Set([...(selectedId ? [selectedId] : []), ...ancestorsSet, ...descendantsSet]), [selectedId, ancestorsSet, descendantsSet]);

  const visibleIds = useMemo(() => new Set(rows.flatMap((r) => [...r.cells.flatMap((c) => cellIds(c)), ...(r.acc ? cellIds(r.acc) : [])])), [rows]);
  const edges = useMemo(() => {
    if (!selectedId || !selected) return [];
    const up = projectedEdges(provenance, [selectedId, ...ancestorsSet], visibleIds).map(([from, to]) => ({ from, to, kind: 'up' as const }));
    const downNodes = new Set([selectedId, ...descendantsSet]);
    const down = projectedEdges(provenance, descendantsSet, visibleIds, (p) => downNodes.has(p)).map(([from, to]) => ({ from, to, kind: 'down' as const }));
    return [...up, ...down];
  }, [provenance, selectedId, selected, ancestorsSet, descendantsSet, visibleIds]);

  const bio = useMemo(() => (selectedId && selected ? biography(provenance, selectedId, clampedStep) : []), [provenance, selectedId, selected, clampedStep]);
  const traceSpans = useMemo<Span[]>(
    () => [...lineage].map((id) => provenance[id]).filter((n) => n && n.stepCreated === 0 && n.span).map((n) => n.span as Span),
    [lineage, provenance],
  );

  const finalId = result.status === 'done' ? result.finalExpr?.meta.id ?? null : null;

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id && tab === 'code') setTab('lineage');
      if (id !== solveFor) setPatches(null);
    },
    [tab, solveFor],
  );

  const openSolver = useCallback(
    (id: string) => {
      const n = provenance[id];
      if (!n || n.kind !== 'num') return;
      setSelectedId(id);
      setTab('solver');
      setTarget(fmtNum(n.value as number));
      setPatches(null);
      setSolveFor(null);
      setFocusToken((t) => t + 1);
    },
    [provenance],
  );

  const runSolver = useCallback(() => {
    if (!selectedId) return;
    const t = Number(target);
    if (!Number.isFinite(t) || target.trim() === '') {
      setToast('Type a number to solve for.');
      return;
    }
    setPatches(solveBackward(selectedId, t, provenance, debounced, { finalId: finalId ?? undefined }));
    setSolveFor(selectedId);
  }, [selectedId, target, provenance, debounced, finalId]);

  const applyPatch = useCallback(
    (p: Patch) => {
      setUndoStack((u) => [...u, debounced]);
      pendingJump.current = 'end';
      setCode(p.newCode);
      setDebounced(p.newCode);
      setFlashSpan({ start: p.span.start, end: p.span.start + p.newText.length });
      window.setTimeout(() => setFlashSpan(null), 2600);
      setPatches(null);
      setSolveFor(null);
      setToast(`Applied: ${p.title}. Output is now ${p.newOutput}.`);
    },
    [debounced, setCode, activeId],
  );

  const undo = useCallback(() => {
    const prev = undoStack[undoStack.length - 1];
    if (prev === undefined) return;
    pendingJump.current = 'end';
    setCode(prev);
    setDebounced(prev);
    setUndoStack((u) => u.slice(0, -1));
    setPatches(null);
  }, [undoStack, setCode, activeId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, activeId }));
    } catch {}
  }, [files, activeId]);

  const resetView = () => {
    pendingJump.current = 'start';
    setSelectedId(null);
    setPatches(null);
    setSolveFor(null);
    setGridOverrides({});
    setPlaying(false);
    setToast(null);
    setFlashIds(EMPTY);
    setFlashSpan(null);
    setTab('code');
  };

  const switchFile = (id: string) => {
    const f = files.find((x) => x.id === id);
    if (!f || id === activeId) return;
    resetView();
    setActiveId(id);
    setDebounced(f.code);
  };

  const addFile = (code = NEW_TAB_CODE, base = 'untitled') => {
    const used = new Set(files.map((f) => f.name));
    let n = 1;
    while (used.has(`${base}-${n}.hs`)) n++;
    const f: ProgramFile = { id: `file-${Date.now().toString(36)}`, name: `${base}-${n}.hs`, code };
    setFiles((fs) => [...fs, f]);
    resetView();
    setActiveId(f.id);
    setDebounced(f.code);
  };

  const closeFile = (id: string) => {
    if (files.length <= 1) return;
    const idx = files.findIndex((f) => f.id === id);
    const rest = files.filter((f) => f.id !== id);
    setFiles(rest);
    setUndoStacks((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    if (id === activeId) {
      const next = rest[Math.max(0, idx - 1)];
      resetView();
      setActiveId(next.id);
      setDebounced(next.code);
    }
  };

  const renameFile = (id: string, name: string) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, name } : f)));

  const onEdit = (c: string) => {
    pendingJump.current = 'keep';
    setCode(c);
    setPatches(null);
  };

  const defaultGrid = true;

  const interaction: StageInteraction = {
    selectedId: selected ? selectedId : null,
    ancestorsSet,
    descendantsSet,
    flashIds,
    onSelect: select,
    onSolve: openSolver,
  };

  const editorStatus: 'ok' | 'error' | 'running' | 'empty' =
    code !== debounced ? 'running' : result.status === 'done' ? 'ok' : result.status === 'empty' ? 'empty' : 'error';

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-5 py-2.5">
        <span className="text-[15px] font-semibold tracking-tight">FluxTrace</span>
      </header>

      <main className={`grid flex-1 grid-cols-1 gap-3 p-3 transition-[padding] lg:min-h-0 ${drawerOpen ? 'pb-40' : 'pb-10'} lg:grid-cols-[minmax(320px,26rem)_minmax(0,1fr)]`}>
        <section className="panel flex min-h-[520px] flex-col overflow-hidden lg:min-h-0">
          <nav className="flex border-b border-ink-200" role="tablist" aria-label="Workspace">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px flex-1 border-b-2 px-3 py-2.5 text-[13px] transition-colors focus:outline-none focus-visible:bg-paper-2 ${tab === t.id ? 'border-ink-800 font-semibold text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
              >
                {t.label}
                {t.id === 'solver' && undoStack.length > 0 && <span className="ml-1.5 rounded bg-sage px-1 text-[10px] text-sage-ink">{undoStack.length}</span>}
              </button>
            ))}
          </nav>
          <div className={`${tab === 'code' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
            <CodeEditor
              code={code}
              onChange={onEdit}
              error={result.error}
              status={editorStatus}
              flashSpan={flashSpan}
              traceSpans={traceSpans}
              stepCount={last}
              files={files}
              activeId={activeId}
              onSwitch={switchFile}
              onAdd={() => addFile()}
              onClose={closeFile}
              onRename={renameFile}
            />
          </div>
          {tab === 'docs' && (
            <DocsPanel
              onTry={(c, title) => {
                addFile(c, title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'example');
                setTab('code');
              }}
            />
          )}
          {tab === 'lineage' && <LineagePanel selected={selected} bio={bio} step={clampedStep} onSelect={select} onJump={goto} />}
          {tab === 'solver' && (
            <SolverPanel
              selected={selected}
              isFinal={!!selectedId && selectedId === finalId}
              target={target}
              onTarget={setTarget}
              onSolve={runSolver}
              patches={patches}
              solveFor={solveFor}
              onApply={applyPatch}
              canUndo={undoStack.length > 0}
              onUndo={undo}
              focusToken={focusToken}
            />
          )}
        </section>

        <section className="flex min-h-[560px] flex-col gap-3 lg:min-h-0">
          {snapshot ? (
            <>
              <ExpressionView snapshot={snapshot} totalSteps={last} lineage={lineage} selectedId={selected ? selectedId : null} onSelect={select} provenance={provenance} />
              <Stage
                rows={rows}
                interaction={interaction}
                edges={edges}
                stepIndex={clampedStep}
                defaultGrid={defaultGrid}
                gridOverrides={gridOverrides}
                onToggleGrid={(k, v) => setGridOverrides((g) => ({ ...g, [k]: v }))}
              />
            </>
          ) : (
            <div className="panel flex flex-1 items-center justify-center p-8 text-center text-sm text-ink-500">
              {result.status === 'empty' ? 'Write a program in the Code tab to see it reduce step by step.' : 'Fix the syntax error in the Code tab to see the reduction.'}
            </div>
          )}
        </section>
      </main>

      {history.length > 0 && (
        <TimelineDrawer
          history={history}
          step={clampedStep}
          onStep={goto}
          playing={playing}
          onTogglePlay={togglePlay}
          speed={speed}
          onSpeed={setSpeed}
          open={drawerOpen}
          onToggleOpen={() => setDrawerOpen((o) => !o)}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 top-14 z-50 max-w-[90vw] -translate-x-1/2 rounded-md border border-ink-200 bg-white px-4 py-2 text-sm text-ink-800 shadow-lift" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
