import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import type { FluxError, Span } from '../engine/types';

const KEYWORDS = new Set(['let', 'in', 'if', 'then', 'else']);
const BUILTINS = new Set(['map', 'fold', 'filter', 'reverse', 'zip', 'range', 'fst', 'snd']);

type TokCls = 'kw' | 'builtin' | 'num' | 'bool' | 'op' | 'comment' | 'var' | 'punct' | '';

function classify(code: string): TokCls[] {
  const cls: TokCls[] = new Array(code.length).fill('');
  const re = /(--[^\n]*|\/\/[^\n]*)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_']*)|(->|==|!=|<=|>=|&&|\|\||[+\-*/%<>=:\\])|([()[\],;])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    let c: TokCls = '';
    if (m[1]) c = 'comment';
    else if (m[2]) c = 'num';
    else if (m[3]) c = KEYWORDS.has(m[3]) ? 'kw' : BUILTINS.has(m[3]) ? 'builtin' : m[3] === 'true' || m[3] === 'false' ? 'bool' : 'var';
    else if (m[4]) c = m[4] === '\\' || m[4] === '->' ? 'kw' : 'op';
    else if (m[5]) c = 'punct';
    for (let i = m.index; i < m.index + m[0].length; i++) cls[i] = c;
  }
  return cls;
}

interface Mark {
  span: { start: number; end: number };
  cls: 'mark-error' | 'mark-flash' | 'mark-trace';
}

function Highlighted({ code, marks }: { code: string; marks: Mark[] }) {
  const parts = useMemo(() => {
    const tok = classify(code);
    const markAt = (i: number) => marks.filter((m) => i >= m.span.start && i < m.span.end).map((m) => m.cls).join(' ');
    const out: { text: string; cls: string }[] = [];
    let cur = '';
    let curCls = '';
    for (let i = 0; i < code.length; i++) {
      const c = [tok[i] ? `tok-${tok[i]}` : '', markAt(i)].filter(Boolean).join(' ');
      if (c !== curCls && cur) {
        out.push({ text: cur, cls: curCls });
        cur = '';
      }
      curCls = c;
      cur += code[i];
    }
    if (cur) out.push({ text: cur, cls: curCls });
    return out;
  }, [code, marks]);
  return (
    <>
      {parts.map((p, i) =>
        p.cls ? (
          <span key={i} className={p.cls}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
      {'\n'}
    </>
  );
}

export function CodeSnippet({ code }: { code: string }) {
  const marks = useMemo<Mark[]>(() => [], []);
  return <Highlighted code={code} marks={marks} />;
}

interface Props {
  code: string;
  onChange: (code: string) => void;
  error?: FluxError;
  status: 'ok' | 'error' | 'running' | 'empty';
  flashSpan?: { start: number; end: number } | null;
  traceSpans?: Span[];
  stepCount: number;
  files: { id: string; name: string }[];
  activeId: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function FileTabs({ files, activeId, onSwitch, onAdd, onClose, onRename }: Pick<Props, 'files' | 'activeId' | 'onSwitch' | 'onAdd' | 'onClose' | 'onRename'>) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId, files.length]);
  const commit = () => {
    if (editing && draft.trim()) onRename(editing, draft.trim());
    setEditing(null);
  };
  return (
    <div ref={stripRef} className="scroll-thin flex items-end gap-px overflow-x-auto border-b border-ink-100 bg-paper-2/60 px-2 pt-1.5" role="tablist" aria-label="Open programs">
      {files.map((f) => {
        const active = f.id === activeId;
        return (
          <div
            key={f.id}
            className={`group flex shrink-0 items-center gap-1 rounded-t-md border border-b-0 px-2.5 py-1.5 text-[12px] ${
              active ? 'border-ink-200 bg-white text-ink-900' : 'border-transparent text-ink-500 hover:bg-white/60 hover:text-ink-800'
            }`}
          >
            {editing === f.id ? (
              <input
                autoFocus
                onFocus={(e) => e.target.select()}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="w-28 rounded border border-ink-300 bg-white px-1 font-mono text-[12px] outline-none"
                aria-label="Rename program"
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSwitch(f.id)}
                onDoubleClick={() => {
                  setEditing(f.id);
                  setDraft(f.name);
                }}
                className="font-mono focus:outline-none"
                title="Double-click to rename"
              >
                {f.name}
              </button>
            )}
            {files.length > 1 && (
              <button
                type="button"
                onClick={() => onClose(f.id)}
                className={`rounded p-0.5 text-ink-400 hover:bg-paper-2 hover:text-ink-800 ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}
                aria-label={`Close ${f.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
      <button type="button" onClick={onAdd} className="mb-1 ml-1 shrink-0 rounded p-1 text-ink-500 hover:bg-white hover:text-ink-900" aria-label="New program" title="New program">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function CodeEditor({ code, onChange, error, status, flashSpan, traceSpans = [], stepCount, ...tabs }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const lines = code.split('\n').length;

  const marks = useMemo<Mark[]>(() => {
    const m: Mark[] = traceSpans.map((s) => ({ span: s, cls: 'mark-trace' }));
    if (error?.span) m.push({ span: { start: error.span.start, end: Math.max(error.span.end, error.span.start + 1) }, cls: 'mark-error' });
    if (flashSpan) m.push({ span: flashSpan, cls: 'mark-flash' });
    return m;
  }, [error, flashSpan, traceSpans]);

  const syncScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = ta;
      onChange(`${code.slice(0, s)}  ${code.slice(en)}`);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileTabs {...tabs} />
      <div className="relative flex min-h-[240px] flex-1 overflow-hidden bg-paper/60">
        <div ref={gutterRef} aria-hidden className="code-layer w-10 shrink-0 select-none overflow-hidden border-r border-ink-100 !px-2 text-right text-ink-300">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className={error?.span?.line === i + 1 ? 'font-semibold text-rose-ink' : undefined}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <pre ref={preRef} aria-hidden className="code-layer pointer-events-none absolute inset-0 text-ink-900">
            <Highlighted code={code} marks={marks} />
          </pre>
          <textarea
            ref={taRef}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label="Program source"
            className="code-layer absolute inset-0 h-full w-full resize-none bg-transparent text-transparent caret-ink-900 outline-none selection:bg-sky"
          />
        </div>
      </div>
      <div className="flex items-center justify-end border-t border-ink-100 px-3 py-1 text-[11px] text-ink-500">
        <span className={status === 'error' ? 'text-rose-ink' : undefined}>
          {status === 'running' ? 'running…' : status === 'empty' ? 'no program yet' : status === 'ok' ? `${stepCount} steps` : error?.phase === 'runtime' ? 'runtime error' : 'syntax error'}
        </span>
      </div>
      {error && (
        <div className="flex items-start gap-2 border-t border-rose-line/60 bg-rose/50 px-3 py-2 font-mono text-[11px] text-rose-ink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {error.message}
            {error.step !== undefined && error.phase === 'runtime' ? ` · at step ${error.step}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
