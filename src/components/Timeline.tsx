import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { StepSnapshot } from '../engine/types';

export const SPEEDS = [
  { label: '0.5×', ms: 1100 },
  { label: '1×', ms: 650 },
  { label: '2×', ms: 320 },
  { label: '4×', ms: 140 },
];

const RULE_COLORS: [string, string, string][] = [
  ['Map', '#9fb9d6', 'map'],
  ['Fold', '#b6a8d8', 'fold'],
  ['Filter', '#d7a7ae', 'filter'],
  ['Arithmetic', '#a3c6ab', 'arithmetic'],
  ['Beta', '#d9c77c', 'beta'],
  ['Let', '#c5c8cc', 'let'],
];

function ruleColor(rule: string): string {
  return RULE_COLORS.find(([p]) => rule.startsWith(p))?.[1] ?? '#ddb48e';
}

interface Props {
  history: StepSnapshot[];
  step: number;
  onStep: (n: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeed: (i: number) => void;
  open: boolean;
  onToggleOpen: () => void;
}

export function TimelineDrawer({ history, step, onStep, playing, onTogglePlay, speed, onSpeed, open, onToggleOpen }: Props) {
  const last = Math.max(0, history.length - 1);
  const fill = last === 0 ? 100 : (step / last) * 100;
  const ticks = useMemo(() => history.map((h) => ruleColor(h.activeRule)), [history]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center">
      <button
        type="button"
        onClick={onToggleOpen}
        className="pointer-events-auto flex items-center gap-1.5 rounded-t-md border border-b-0 border-ink-200 bg-white px-3 py-1 text-[11px] text-ink-600 shadow-card hover:text-ink-900"
        aria-expanded={open}
        aria-controls="timeline-drawer"
        title="Show / hide the timeline (T)"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        Timeline <span className="font-mono text-ink-400">{step}/{last}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="timeline-drawer"
            key="drawer"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="pointer-events-auto w-full overflow-hidden border-t border-ink-200 bg-white"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <button type="button" className="btn !px-2" onClick={() => onStep(0)} disabled={step === 0} title="First step (Home)">
                    <SkipBack className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="btn !px-2" onClick={() => onStep(step - 1)} disabled={step === 0} title="Step back (←)">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="btn btn-solid min-w-[5rem]" onClick={onTogglePlay} disabled={last === 0} title="Play / pause (Space)">
                    {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {playing ? 'Pause' : step >= last ? 'Replay' : 'Play'}
                  </button>
                  <button type="button" className="btn !px-2" onClick={() => onStep(step + 1)} disabled={step >= last} title="Step forward (→)">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="btn !px-2" onClick={() => onStep(last)} disabled={step >= last} title="Last step (End)">
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center rounded-md border border-ink-200 p-0.5">
                  {SPEEDS.map((s, i) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => onSpeed(i)}
                      className={`rounded px-2 py-0.5 font-mono text-[11px] ${i === speed ? 'bg-ink-800 text-paper' : 'text-ink-500 hover:text-ink-900'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <span className="ml-auto font-mono text-xs text-ink-500">
                  step <span className="text-ink-900">{step}</span> / {last}
                </span>
              </div>
              <input
                type="range"
                className="scrubber"
                min={0}
                max={last}
                value={step}
                onChange={(e) => onStep(Number(e.target.value))}
                style={{ ['--fill' as string]: `${fill}%` }}
                aria-label="Timeline scrubber"
              />
              <div className="hidden h-2 gap-px overflow-hidden rounded-sm sm:flex">
                {ticks.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onStep(i)}
                    className="h-full flex-1"
                    style={{ background: c, opacity: i <= step ? 1 : 0.35 }}
                    title={`step ${i}: ${history[i].activeRule}`}
                  />
                ))}
              </div>
              <div className="hidden flex-wrap gap-3 text-[10px] text-ink-500 sm:flex">
                {[...RULE_COLORS, ['Other', '#ddb48e', 'reverse / zip / range / compare']].map(([, c, l]) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: c }} /> {l}
                  </span>
                ))}
                <span className="ml-auto">← → step · Space play · Home / End · T toggle</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
