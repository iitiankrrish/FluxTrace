import { parse } from './parser';
import { fmtNum, prettyString } from './pretty';
import { run } from './stepper';
import type { Expr, Patch, PatchStep, ProvenanceIndex, ProvenanceNode, RunResult } from './types';

const EPS = 1e-6;
const MAX_CANDIDATES = 32;
const MAX_DEPTH = 80;

interface Candidate {
  literalId: string;
  newValue: number;
  chain: PatchStep[];
  method: 'algebraic' | 'secant';
}

const clean = (n: number) => parseFloat(n.toPrecision(12));

function invert(graph: ProvenanceIndex, id: string, target: number, depth: number, chain: PatchStep[], out: Candidate[]): void {
  if (out.length >= MAX_CANDIDATES || depth > MAX_DEPTH || !Number.isFinite(target)) return;
  const node = graph[id];
  if (!node || node.kind !== 'num') return;
  const t = clean(target);

  if (node.operator === 'literal') {
    if (node.span) out.push({ literalId: id, newValue: t, chain, method: 'algebraic' });
    return;
  }
  const step = (explanation: string): PatchStep[] => [...chain, { nodeId: id, rule: node.rule, explanation }];
  const val = (pid: string) => graph[pid]?.value as number;
  const [a, b] = node.parentIds;
  const c = node.value as number;

  switch (node.operator) {
    case '+': {
      const va = val(a);
      const vb = val(b);
      if (a === b) {
        invert(graph, a, t / 2, depth + 1, step(`${fmtNum(c)} = x + x  ⇒  x = ${fmtNum(t)} / 2 = ${fmtNum(clean(t / 2))}`), out);
        return;
      }
      invert(graph, a, t - vb, depth + 1, step(`${fmtNum(t)} = a + ${fmtNum(vb)}  ⇒  a = ${fmtNum(t)} − ${fmtNum(vb)} = ${fmtNum(clean(t - vb))}`), out);
      invert(graph, b, t - va, depth + 1, step(`${fmtNum(t)} = ${fmtNum(va)} + b  ⇒  b = ${fmtNum(t)} − ${fmtNum(va)} = ${fmtNum(clean(t - va))}`), out);
      return;
    }
    case '-': {
      if (a === b) return;
      const va = val(a);
      const vb = val(b);
      invert(graph, a, t + vb, depth + 1, step(`${fmtNum(t)} = a − ${fmtNum(vb)}  ⇒  a = ${fmtNum(t)} + ${fmtNum(vb)} = ${fmtNum(clean(t + vb))}`), out);
      invert(graph, b, va - t, depth + 1, step(`${fmtNum(t)} = ${fmtNum(va)} − b  ⇒  b = ${fmtNum(va)} − ${fmtNum(t)} = ${fmtNum(clean(va - t))}`), out);
      return;
    }
    case '*': {
      const va = val(a);
      const vb = val(b);
      if (a === b) {
        if (t >= 0) invert(graph, a, Math.sqrt(t), depth + 1, step(`${fmtNum(t)} = x * x  ⇒  x = √${fmtNum(t)} = ${fmtNum(clean(Math.sqrt(t)))}`), out);
        return;
      }
      if (vb !== 0) invert(graph, a, t / vb, depth + 1, step(`${fmtNum(t)} = a * ${fmtNum(vb)}  ⇒  a = ${fmtNum(t)} / ${fmtNum(vb)} = ${fmtNum(clean(t / vb))}`), out);
      if (va !== 0) invert(graph, b, t / va, depth + 1, step(`${fmtNum(t)} = ${fmtNum(va)} * b  ⇒  b = ${fmtNum(t)} / ${fmtNum(va)} = ${fmtNum(clean(t / va))}`), out);
      return;
    }
    case '/': {
      if (a === b) return;
      const va = val(a);
      const vb = val(b);
      invert(graph, a, t * vb, depth + 1, step(`${fmtNum(t)} = a / ${fmtNum(vb)}  ⇒  a = ${fmtNum(t)} * ${fmtNum(vb)} = ${fmtNum(clean(t * vb))}`), out);
      if (t !== 0) invert(graph, b, va / t, depth + 1, step(`${fmtNum(t)} = ${fmtNum(va)} / b  ⇒  b = ${fmtNum(va)} / ${fmtNum(t)} = ${fmtNum(clean(va / t))}`), out);
      return;
    }
    case '%': {
      const va = val(a);
      const vb = val(b);
      if (vb > 0 && t >= 0 && t < vb) {
        const na = va + (t - c);
        invert(graph, a, na, depth + 1, step(`${fmtNum(t)} = a mod ${fmtNum(vb)}  ⇒  a = ${fmtNum(va)} + (${fmtNum(t)} − ${fmtNum(c)}) = ${fmtNum(clean(na))}`), out);
      }
      return;
    }
    case 'copy':
      invert(graph, a, t, depth + 1, step(`${node.rule}: value is carried unchanged ⇒ upstream = ${fmtNum(t)}`), out);
      return;
    case 'offset': {
      const k = node.offset ?? 0;
      invert(graph, a, t - k, depth + 1, step(`${fmtNum(t)} = start + ${k}  ⇒  start = ${fmtNum(clean(t - k))}`), out);
      return;
    }
    default:
      return;
  }
}

export function ancestorLiterals(graph: ProvenanceIndex, id: string): string[] {
  const seen = new Set<string>();
  const lits: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = graph[cur];
    if (!n) continue;
    if (n.operator === 'literal' && n.kind === 'num' && n.span) lits.push(cur);
    stack.push(...n.parentIds);
  }
  return lits;
}

export function literalText(value: number, oldText: string): string {
  const t = fmtNum(value);
  return value < 0 && !oldText.trim().startsWith('-') ? `(${t})` : t;
}

export function replaceLiteral(code: string, lit: ProvenanceNode, value: number): string {
  const span = lit.span;
  if (!span) return code;
  const oldText = code.slice(span.start, span.end);
  return code.slice(0, span.start) + literalText(value, oldText) + code.slice(span.end);
}

export interface SolveOptions {
  finalId?: string;
  algebraicOnly?: boolean;
}

function observe(r: RunResult, nodeId: string, finalId?: string): number | null {
  if (r.status !== 'done') return null;
  if (finalId && nodeId === finalId) {
    return r.finalExpr?.kind === 'num' ? r.finalExpr.value : null;
  }
  const n = r.provenance[nodeId];
  return n && n.kind === 'num' ? (n.value as number) : null;
}

function secant(code: string, lit: ProvenanceNode, target: number, nodeId: string, finalId?: string): number | null {
  const f = (v: number): number | null => {
    const o = observe(run(replaceLiteral(code, lit, v), { lite: true }), nodeId, finalId);
    return o === null ? null : o - target;
  };
  let x0 = lit.value as number;
  let f0 = f(x0);
  if (f0 === null) return null;
  let x1 = x0 === 0 ? 1 : x0 * 1.5;
  let f1 = f(x1);
  for (let iter = 0; iter < 14; iter++) {
    if (f1 === null) return null;
    if (Math.abs(f1) < EPS) return clean(x1);
    if (Math.abs(f1 - f0) < 1e-12) return null;
    const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
    if (!Number.isFinite(x2)) return null;
    x0 = x1;
    f0 = f1;
    x1 = clean(x2);
    f1 = f(x1);
  }
  return f1 !== null && Math.abs(f1) < EPS ? clean(x1) : null;
}

function siblingValues(code: string, literalId: string): number[] {
  let found: number[] = [];
  const visit = (e: Expr): void => {
    if (found.length) return;
    switch (e.kind) {
      case 'list':
        if (e.items.some((x) => x.meta.id === literalId)) {
          found = e.items.filter((x) => x.kind === 'num' && x.meta.id !== literalId).map((x) => (x as { value: number }).value);
          return;
        }
        e.items.forEach(visit);
        return;
      case 'tuple':
        e.items.forEach(visit);
        return;
      case 'lam':
        visit(e.body);
        return;
      case 'app':
        visit(e.fn);
        e.args.forEach(visit);
        return;
      case 'binop':
        visit(e.left);
        visit(e.right);
        return;
      case 'if':
        visit(e.cond);
        visit(e.then);
        visit(e.else);
        return;
      case 'let':
        visit(e.value);
        visit(e.body);
        return;
      default:
        return;
    }
  };
  try {
    visit(parse(code).ast);
  } catch {
    return [];
  }
  return found;
}

export function plausibility(code: string, literalId: string, oldValue: number, newValue: number): number {
  const sib = siblingValues(code, literalId).sort((a, b) => a - b);
  if (sib.length < 2) return 0;
  const mid = sib.length % 2 ? sib[(sib.length - 1) / 2] : (sib[sib.length / 2 - 1] + sib[sib.length / 2]) / 2;
  const spread = Math.max(1, sib[sib.length - 1] - sib[0]);
  return (Math.abs(oldValue - mid) - Math.abs(newValue - mid)) / spread;
}

function snap(code: string, lit: ProvenanceNode, x: number, target: number, nodeId: string, finalId?: string): number {
  for (let d = 0; d <= 6; d++) {
    const v = Number(x.toFixed(d));
    const o = observe(run(replaceLiteral(code, lit, v), { lite: true }), nodeId, finalId);
    if (o !== null && Math.abs(o - target) < 1e-9) return v;
  }
  return x;
}

function patchTitle(lit: ProvenanceNode, chain: PatchStep[], graph: ProvenanceIndex, oldText: string, newText: string): string {
  const role = lit.role;
  const consumer = chain.length ? graph[chain[chain.length - 1].nodeId] : undefined;
  const opWord: Record<string, string> = { '*': 'multiplier', '/': 'divisor', '+': 'offset', '-': 'offset', '%': 'modulus' };
  const arrow = `${oldText.trim()} → ${newText}`;
  switch (role?.kind) {
    case 'list-element':
      return `Change input list element ${arrow}`;
    case 'lambda-constant':
      return `Change lambda ${consumer?.operator && opWord[consumer.operator] ? opWord[consumer.operator] : 'constant'} ${arrow}`;
    case 'let-binding':
      return `Change ${role.description} ${arrow}`;
    case 'argument':
      return `Change ${role.description} ${arrow}`;
    default:
      return `Change constant ${arrow}`;
  }
}

export function solveBackward(
  nodeId: string,
  targetVal: number,
  provenanceGraph: ProvenanceIndex,
  originalCode: string,
  options: SolveOptions = {},
): Patch[] {
  const target = provenanceGraph[nodeId];
  if (!target || target.kind !== 'num' || !Number.isFinite(targetVal)) return [];

  const candidates: Candidate[] = [];
  invert(provenanceGraph, nodeId, targetVal, 0, [], candidates);

  const byLiteral = new Map<string, Patch>();
  const build = (cand: Candidate): Patch | null => {
    const lit = provenanceGraph[cand.literalId];
    if (!lit?.span || !Number.isFinite(cand.newValue)) return null;
    const oldValue = lit.value as number;
    if (Math.abs(oldValue - cand.newValue) < EPS) return null;
    const oldText = originalCode.slice(lit.span.start, lit.span.end);
    const newText = literalText(cand.newValue, oldText);
    const newCode = replaceLiteral(originalCode, lit, cand.newValue);
    const rerun = run(newCode, { lite: true });
    const achieved = observe(rerun, nodeId, options.finalId);
    const verified = achieved !== null && Math.abs(achieved - targetVal) < EPS;
    const chain =
      cand.method === 'secant'
        ? [
            ...cand.chain,
            {
              nodeId: cand.literalId,
              rule: 'Secant refinement',
              explanation: `literal is shared by several computations ⇒ solved f(${oldText.trim()}′) = ${fmtNum(targetVal)} numerically by re-running the program`,
            },
          ]
        : cand.chain;
    return {
      id: `patch_${cand.literalId}_${fmtNum(cand.newValue)}`,
      title: patchTitle(lit, cand.chain, provenanceGraph, oldText, newText),
      description: `${lit.role?.description ?? 'source literal'} · line ${lit.span.line}, col ${lit.span.col}`,
      literalId: cand.literalId,
      line: lit.span.line,
      col: lit.span.col,
      span: lit.span,
      oldValue,
      newValue: cand.newValue,
      oldText,
      newText,
      newCode,
      chain,
      verified,
      score: plausibility(originalCode, cand.literalId, oldValue, cand.newValue),
      achievedValue: achieved,
      newOutput: rerun.finalExpr && rerun.status === 'done' ? prettyString(rerun.finalExpr, 60) : `⚠ ${rerun.error?.message ?? 'error'}`,
    };
  };

  for (const cand of candidates) {
    const existing = byLiteral.get(cand.literalId);
    if (existing?.verified) continue;
    const p = build(cand);
    if (p && (!existing || p.verified)) byLiteral.set(cand.literalId, p);
  }

  if (!options.algebraicOnly) {
    const lits = ancestorLiterals(provenanceGraph, nodeId).slice(0, 16);
    for (const litId of lits) {
      if (byLiteral.get(litId)?.verified) continue;
      const lit = provenanceGraph[litId];
      const root = secant(originalCode, lit, targetVal, nodeId, options.finalId);
      if (root === null) continue;
      const solved = snap(originalCode, lit, root, targetVal, nodeId, options.finalId);
      const algebraic = candidates.find((c) => c.literalId === litId);
      const p = build({ literalId: litId, newValue: solved, chain: algebraic?.chain ?? [], method: 'secant' });
      if (p && p.verified) byLiteral.set(litId, p);
    }
  }

  const isNice = (v: number) => (Number.isInteger(v) ? 0 : 1);
  return [...byLiteral.values()].sort(
    (x, y) =>
      Number(y.verified) - Number(x.verified) ||
      isNice(x.newValue) - isNice(y.newValue) ||
      y.score - x.score ||
      x.chain.length - y.chain.length ||
      x.span.start - y.span.start,
  );
}

export function applyPatch(patch: Patch): string {
  return patch.newCode;
}
