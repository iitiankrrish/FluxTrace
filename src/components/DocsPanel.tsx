import { useMemo, useRef, useState } from 'react';
import { Play, Search } from 'lucide-react';
import { DOCS, PRECEDENCE, type DocEntry, type DocSection } from '../engine/docs';
import { CodeSnippet } from './CodeEditor';

function Prose({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <code key={i} className="rounded bg-paper-2 px-1 py-px font-mono text-[11.5px] text-ink-800">
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Entry({ entry, onTry }: { entry: DocEntry; onTry: (code: string, title: string) => void }) {
  return (
    <div className="border-t border-ink-100 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-[13px] font-semibold text-ink-900">{entry.title}</h4>
        {entry.signature && <code className="rounded bg-lilac px-1.5 py-px font-mono text-[11px] text-lilac-ink">{entry.signature}</code>}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">
        <Prose text={entry.text} />
      </p>
      {entry.examples.map((ex, i) => {
        const failed = ex.result.startsWith('error: ');
        return (
          <div key={i} className="group mt-2 overflow-hidden rounded-md border border-ink-100 bg-paper/70">
            <div className="flex items-start">
              <pre className="scroll-thin min-w-0 flex-1 overflow-x-auto px-3 py-2 font-mono text-[12px] leading-5 [font-variant-ligatures:none]">
                <CodeSnippet code={ex.code} />
              </pre>
              <button
                type="button"
                onClick={() => onTry(ex.code, entry.title)}
                className="m-1.5 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-ink-500 hover:bg-white hover:text-ink-900"
                title="Open this example in a new tab"
              >
                <Play className="h-3 w-3" /> Try
              </button>
            </div>
            <div className={`border-t border-ink-100 px-3 py-1.5 font-mono text-[11.5px] ${failed ? 'bg-rose/40 text-rose-ink' : 'bg-white/70 text-sage-ink'}`}>
              {failed ? ex.result : `→ ${ex.result}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Precedence() {
  return (
    <table className="mb-1 mt-1 w-full text-left text-[12px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-ink-400">
          <th className="py-1 font-medium">Tightest first</th>
          <th className="py-1 font-medium">Assoc.</th>
          <th className="py-1 font-medium">Meaning</th>
        </tr>
      </thead>
      <tbody>
        {PRECEDENCE.map((p) => (
          <tr key={p.ops} className="border-t border-ink-100">
            <td className="whitespace-pre py-1 pr-2 font-mono text-ink-800">{p.ops}</td>
            <td className="py-1 pr-2 text-ink-500">{p.assoc}</td>
            <td className="py-1 text-ink-600">{p.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const matches = (e: DocEntry, q: string) =>
  [e.title, e.signature ?? '', e.text, ...e.examples.map((x) => x.code)].some((s) => s.toLowerCase().includes(q));

export function DocsPanel({ onTry }: { onTry: (code: string, title: string) => void }) {
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const sections = useMemo<DocSection[]>(
    () => (q ? DOCS.map((s) => ({ ...s, entries: s.entries.filter((e) => matches(e, q) || s.title.toLowerCase().includes(q)) })).filter((s) => s.entries.length) : DOCS),
    [q],
  );
  const jump = (id: string) => {
    const box = scrollRef.current;
    const el = box?.querySelector<HTMLElement>(`#docs-${id}`);
    if (box && el) box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top, behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-ink-100 bg-paper-2/60 px-3 pb-2 pt-2.5">
        <label className="flex items-center gap-2 rounded-md border border-ink-200 bg-white px-2 py-1.5 focus-within:border-ink-400">
          <Search className="h-3.5 w-3.5 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the language reference"
            aria-label="Search the language reference"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-400"
          />
        </label>
        {!q && (
          <div className="scroll-thin -mx-1 mt-2 flex gap-1 overflow-x-auto px-1">
            {DOCS.map((s) => (
              <button key={s.id} type="button" onClick={() => jump(s.id)} className="shrink-0 rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] text-ink-600 hover:border-ink-400 hover:text-ink-900">
                {s.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={scrollRef} className="scroll-thin relative max-h-[70vh] min-h-0 flex-1 overflow-auto px-4 pb-6 lg:max-h-none">
        {sections.length === 0 && <p className="py-8 text-center text-[13px] text-ink-500">Nothing matches “{query}”.</p>}
        {sections.map((s) => (
          <section key={s.id} id={`docs-${s.id}`} className="pt-4">
            <h3 className="panel-title">{s.title}</h3>
            {s.intro && !q && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600">
                <Prose text={s.intro} />
              </p>
            )}
            {s.id === 'operators' && !q && <Precedence />}
            <div className="mt-1">
              {s.entries.map((e) => (
                <Entry key={e.title} entry={e} onTry={onTry} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
