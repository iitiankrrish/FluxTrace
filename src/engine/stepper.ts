import { collectSourceRoles, FluxSyntaxError, IdGen, parse, tokenize } from './parser';
import { fmtNum, prettyString } from './pretty';
import { collectStages } from './stages';
import { isValue } from './values';

export { isValue };
import {
  BUILTIN_ARITY,
  type BinOpName,
  type BuiltinName,
  type Expr,
  type FluxError,
  type HofNode,
  type ListNode,
  type NumNode,
  type Operator,
  type ProvenanceIndex,
  type ProvenanceMeta,
  type RunResult,
  type SourceRole,
  type Span,
  type StepSnapshot,
  type ValueKind,
} from './types';

export const MAX_STEPS = 300;
const MAX_RANGE = 1000;

export class FluxRuntimeError extends Error {
  constructor(
    message: string,
    readonly span?: Span,
  ) {
    super(message);
  }
}

export function toJS(e: Expr): unknown {
  switch (e.kind) {
    case 'num':
    case 'bool':
      return e.value;
    case 'list':
    case 'tuple':
      return e.items.map(toJS);
    default:
      return prettyString(e);
  }
}

function deepEqual(a: Expr, b: Expr): boolean {
  if ((a.kind === 'num' && b.kind === 'num') || (a.kind === 'bool' && b.kind === 'bool')) return a.value === b.value;
  if ((a.kind === 'list' && b.kind === 'list') || (a.kind === 'tuple' && b.kind === 'tuple')) {
    return a.items.length === b.items.length && a.items.every((x, i) => deepEqual(x, b.items[i]));
  }
  return false;
}

function describe(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return 'a number';
    case 'bool':
      return 'a boolean';
    case 'list':
      return 'a list';
    case 'tuple':
      return 'a tuple';
    case 'lam':
    case 'builtin':
      return 'a function';
    default:
      return 'an expression';
  }
}

const short = (e: Expr, n = 34) => prettyString(e, n);
const toneOf = (e: Expr): number[] => (e.kind === 'num' ? [e.value] : []);

interface Rewrite {
  node: Expr;
  redexId: string;
  contractumId: string;
  rule: string;
  formula: string;
  tones: number[];
}

export class Machine {
  step = 0;
  readonly prov: ProvenanceIndex = {};
  created: string[] = [];

  constructor(readonly ids: IdGen) {}

  private meta(rule: string, formula: string, parentIds: string[], operator: Operator, offset?: number): ProvenanceMeta {
    return { id: this.ids.next(), stepCreated: this.step, rule, formula, parentIds, operator, offset };
  }

  register(e: Expr): void {
    let kind: ValueKind;
    let value: number | boolean | string;
    if (e.kind === 'num' || e.kind === 'bool') {
      kind = e.kind;
      value = e.value;
    } else if (e.kind === 'list' || e.kind === 'tuple' || e.kind === 'lam') {
      kind = e.kind;
      value = prettyString(e, 60);
    } else {
      return;
    }
    this.prov[e.meta.id] = { ...e.meta, value, kind, span: e.span, placements: [] };
    if (e.meta.stepCreated === this.step && this.step > 0) this.created.push(e.meta.id);
  }

  private num(value: number, rule: string, formula: string, parents: string[], operator: Operator, offset?: number): NumNode {
    const n: NumNode = { kind: 'num', value, meta: this.meta(rule, formula, parents, operator, offset) };
    this.register(n);
    return n;
  }

  private bool(value: boolean, rule: string, formula: string, parents: string[], operator: Operator): Expr {
    const b: Expr = { kind: 'bool', value, meta: this.meta(rule, formula, parents, operator) };
    this.register(b);
    return b;
  }

  private copy(v: Expr, rule: string, formula: string, extraParents: string[] = []): Expr {
    if (v.kind === 'num') return this.num(v.value, rule, formula, [v.meta.id, ...extraParents], 'copy');
    if (v.kind === 'bool') return this.bool(v.value, rule, formula, [v.meta.id, ...extraParents], 'copy');
    return v;
  }

  private list(items: Expr[], rule: string, formula: string, parents: string[], origin: string, id?: string): ListNode {
    const meta = this.meta(rule, formula, parents, 'list');
    if (id) meta.id = id;
    const l: ListNode = { kind: 'list', items, origin, meta };
    this.register(l);
    return l;
  }

  private place(e: Expr, where: string): void {
    const p = this.prov[e.meta.id];
    if (p) p.placements.push(`${where} @ step ${this.step}`);
  }

  private fresh<T extends Expr>(e: T, rule = 'Substitution'): T {
    return { ...e, meta: { ...e.meta, id: this.ids.next(), stepCreated: this.step, rule, parentIds: [], operator: 'structure' } };
  }

  subst(e: Expr, name: string, v: Expr): Expr {
    switch (e.kind) {
      case 'var':
        return e.name === name ? v : e;
      case 'num':
      case 'bool':
      case 'builtin':
        return e;
      case 'list':
      case 'tuple': {
        const items = e.items.map((x) => this.subst(x, name, v));
        return items.some((x, i) => x !== e.items[i]) ? { ...this.fresh(e), items } : e;
      }
      case 'lam': {
        if (e.params.includes(name)) return e;
        const body = this.subst(e.body, name, v);
        return body !== e.body ? { ...this.fresh(e), body } : e;
      }
      case 'app': {
        const fn = this.subst(e.fn, name, v);
        const args = e.args.map((a) => this.subst(a, name, v));
        return fn !== e.fn || args.some((a, i) => a !== e.args[i]) ? { ...this.fresh(e), fn, args } : e;
      }
      case 'binop': {
        const left = this.subst(e.left, name, v);
        const right = this.subst(e.right, name, v);
        return left !== e.left || right !== e.right ? { ...this.fresh(e), left, right } : e;
      }
      case 'if': {
        const c = this.subst(e.cond, name, v);
        const t = this.subst(e.then, name, v);
        const f = this.subst(e.else, name, v);
        return c !== e.cond || t !== e.then || f !== e.else ? { ...this.fresh(e), cond: c, then: t, else: f } : e;
      }
      case 'let': {
        const value = this.subst(e.value, name, v);
        const body = e.name === name ? e.body : this.subst(e.body, name, v);
        return value !== e.value || body !== e.body ? { ...this.fresh(e), value, body } : e;
      }
      case 'guard': {
        const body = this.subst(e.body, name, v);
        return body !== e.body ? { ...e, body } : e;
      }
      case 'hof': {
        const fn = this.subst(e.fn, name, v);
        const current = this.subst(e.current, name, v);
        return fn !== e.fn || current !== e.current ? { ...e, fn, current } : e;
      }
    }
  }

  reduce(e: Expr): Rewrite | null {
    switch (e.kind) {
      case 'num':
      case 'bool':
      case 'lam':
      case 'builtin':
        return null;
      case 'var':
        throw new FluxRuntimeError(`Unbound variable '${e.name}'`, e.span);
      case 'list':
      case 'tuple': {
        const i = e.items.findIndex((x) => !isValue(x));
        if (i < 0) return null;
        const r = this.reduce(e.items[i]) as Rewrite;
        const items = e.items.slice();
        items[i] = r.node;
        return { ...r, node: { ...e, items } };
      }
      case 'binop': {
        if (!isValue(e.left)) {
          const r = this.reduce(e.left) as Rewrite;
          return { ...r, node: { ...e, left: r.node } };
        }
        if (!isValue(e.right)) {
          const r = this.reduce(e.right) as Rewrite;
          return { ...r, node: { ...e, right: r.node } };
        }
        return this.binop(e.op, e.left, e.right, e);
      }
      case 'if': {
        if (!isValue(e.cond)) {
          const r = this.reduce(e.cond) as Rewrite;
          return { ...r, node: { ...e, cond: r.node } };
        }
        if (e.cond.kind !== 'bool') {
          throw new FluxRuntimeError(`if-condition must be a boolean, got ${describe(e.cond)}`, e.cond.span ?? e.span);
        }
        const branch = e.cond.value ? 'then' : 'else';
        const chosen = e.cond.value ? e.then : e.else;
        const rule = `If-${e.cond.value ? 'True' : 'False'}`;
        const formula = `if ${e.cond.value} → ${branch}-branch: ${short(chosen, 30)}`;
        let node: Expr;
        if (chosen.kind === 'num' || chosen.kind === 'bool') node = this.copy(chosen, `${rule} (${branch}-branch)`, formula, [e.cond.meta.id]);
        else if (isValue(chosen)) node = chosen;
        else node = { kind: 'guard', cond: e.cond, body: chosen, branch, meta: this.meta(rule, formula, [], 'structure') };
        return this.out(e, node, rule, formula, toneOf(chosen));
      }
      case 'guard': {
        if (!isValue(e.body)) {
          const r = this.reduce(e.body) as Rewrite;
          return { ...r, node: { ...e, body: r.node } };
        }
        const formula = `${e.branch}-branch value ${short(e.body, 16)} (condition was ${short(e.cond, 8)})`;
        const node =
          e.body.kind === 'num' || e.body.kind === 'bool' ? this.copy(e.body, `If result (${e.branch}-branch)`, formula, [e.cond.meta.id]) : e.body;
        return this.out(e, node, `If result (${e.branch}-branch)`, formula, toneOf(e.body));
      }
      case 'let': {
        if (!isValue(e.value)) {
          const r = this.reduce(e.value) as Rewrite;
          return { ...r, node: { ...e, value: r.node } };
        }
        const body = this.subst(e.body, e.name, e.value);
        return this.out(e, body, `Let Binding: ${e.name} = ${short(e.value, 24)}`, `substitute ${e.name} := ${short(e.value, 40)}`, []);
      }
      case 'app':
        return this.app(e);
      case 'hof':
        return this.hof(e);
    }
  }

  private out(redex: Expr, node: Expr, rule: string, formula: string, tones: number[]): Rewrite {
    return { node, redexId: redex.meta.id, contractumId: node.meta.id, rule, formula, tones };
  }

  private binop(op: BinOpName, l: Expr, r: Expr, redex: Expr): Rewrite {
    const parents = [l.meta.id, r.meta.id];
    if (op === ':') {
      if (r.kind !== 'list') throw new FluxRuntimeError(`(:) needs a list on the right, got ${describe(r)}`, redex.span);
      const node = this.list([l, ...r.items], 'Cons (:)', `${short(l, 12)} : ${short(r, 30)}`, parents, 'cons');
      return this.out(redex, node, 'Cons (:)', `${short(l, 12)} : ${short(r, 30)} = ${short(node, 40)}`, l.kind === 'num' ? [l.value] : []);
    }
    if (op === '==' || op === '!=') {
      const eq = deepEqual(l, r);
      const v = op === '==' ? eq : !eq;
      const f = `${short(l, 16)} ${op} ${short(r, 16)} = ${v}`;
      return this.out(redex, this.bool(v, `Comparison (${op})`, f, parents, 'compare'), `Comparison (${op})`, f, []);
    }
    if (op === '&&' || op === '||') {
      if (l.kind !== 'bool' || r.kind !== 'bool') {
        throw new FluxRuntimeError(`(${op}) needs booleans, got ${describe(l)} and ${describe(r)}`, redex.span);
      }
      const v = op === '&&' ? l.value && r.value : l.value || r.value;
      const f = `${l.value} ${op} ${r.value} = ${v}`;
      return this.out(redex, this.bool(v, `Logic (${op})`, f, parents, 'logic'), `Logic (${op})`, f, []);
    }
    if (l.kind !== 'num' || r.kind !== 'num') {
      throw new FluxRuntimeError(`(${op}) needs numbers, got ${describe(l)} and ${describe(r)}`, redex.span);
    }
    const a = l.value;
    const b = r.value;
    if (op === '<' || op === '>' || op === '<=' || op === '>=') {
      const v = op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
      const f = `${fmtNum(a)} ${op} ${fmtNum(b)} = ${v}`;
      return this.out(redex, this.bool(v, `Comparison (${op})`, f, parents, 'compare'), `Comparison (${op})`, f, []);
    }
    let c: number;
    switch (op) {
      case '+':
        c = a + b;
        break;
      case '-':
        c = a - b;
        break;
      case '*':
        c = a * b;
        break;
      case '/':
        if (b === 0) throw new FluxRuntimeError('Division by zero', redex.span);
        c = a / b;
        break;
      case '%':
        if (b === 0) throw new FluxRuntimeError('Modulo by zero', redex.span);
        c = ((a % b) + b) % b;
        break;
    }
    c = parseFloat(c.toPrecision(12));
    const f = `${fmtNum(a)} ${op} ${fmtNum(b)} = ${fmtNum(c)}`;
    const rule = `Arithmetic (${op})`;
    return this.out(redex, this.num(c, rule, f, parents, op), rule, f, [c]);
  }

  private app(e: Extract<Expr, { kind: 'app' }>): Rewrite | null {
    if (isValue(e)) return null;
    if (!isValue(e.fn)) {
      const r = this.reduce(e.fn) as Rewrite;
      return { ...r, node: { ...e, fn: r.node } };
    }
    const ai = e.args.findIndex((a) => !isValue(a));
    if (ai >= 0) {
      const r = this.reduce(e.args[ai]) as Rewrite;
      const args = e.args.slice();
      args[ai] = r.node;
      return { ...r, node: { ...e, args } };
    }
    const fn = e.fn;
    if (fn.kind === 'app') {
      const node: Expr = { ...e, fn: fn.fn, args: [...fn.args, ...e.args] };
      return this.out(e, node, 'Saturate Application', `${short(fn, 30)} ${e.args.map((a) => short(a, 12)).join(' ')}`, []);
    }
    if (fn.kind === 'lam') {
      const k = Math.min(fn.params.length, e.args.length);
      let body = fn.body;
      for (let i = 0; i < k; i++) body = this.subst(body, fn.params[i], e.args[i]);
      let node: Expr;
      if (fn.params.length > k) {
        node = { kind: 'lam', params: fn.params.slice(k), body, meta: this.meta('Partial Application', short(fn), [], 'closure') };
      } else if (e.args.length > k) {
        node = { kind: 'app', fn: body, args: e.args.slice(k), meta: this.meta('Over-application', short(fn), [], 'structure') };
      } else {
        node = body;
      }
      const binds = fn.params
        .slice(0, k)
        .map((p, i) => `${p} := ${short(e.args[i], 14)}`)
        .join(', ');
      const tones = e.args.slice(0, k).flatMap((a) => (a.kind === 'num' ? [a.value] : []));
      return this.out(e, node, `Beta-Reduction (${short(fn, 28)})`, `${binds} ⇒ ${short(node, 48)}`, tones);
    }
    if (fn.kind === 'builtin') {
      const arity = BUILTIN_ARITY[fn.name];
      const args = e.args.slice(0, arity);
      let node = this.builtin(fn.name, args, e);
      if (e.args.length > arity) {
        node = { ...node, node: { kind: 'app', fn: node.node, args: e.args.slice(arity), meta: this.meta('Over-application', fn.name, [], 'structure') } };
      }
      return node;
    }
    throw new FluxRuntimeError(`Cannot apply ${describe(fn)} (${short(fn, 20)}) as a function`, e.span);
  }

  private needList(v: Expr, fname: string, at: Expr): Extract<Expr, { kind: 'list' }> {
    if (v.kind !== 'list') throw new FluxRuntimeError(`${fname} expects a list, got ${describe(v)}`, at.span);
    return v;
  }

  private needFn(v: Expr, fname: string, at: Expr): void {
    const ok = v.kind === 'lam' || v.kind === 'builtin' || (v.kind === 'app' && isValue(v));
    if (!ok) throw new FluxRuntimeError(`${fname} expects a function first, got ${describe(v)}`, at.span);
  }

  private apply(fn: Expr, args: Expr[]): Expr {
    return { kind: 'app', fn, args, meta: this.meta('Apply', '', [], 'structure') };
  }

  private builtin(name: BuiltinName, args: Expr[], redex: Expr): Rewrite {
    switch (name) {
      case 'map':
      case 'filter': {
        this.needFn(args[0], name, redex);
        const xs = this.needList(args[1], name, redex);
        if (xs.items.length === 0) {
          const node = this.list([], `${name} (empty)`, `${name} f [] = []`, [xs.meta.id], `${name} output`);
          return this.out(redex, node, `${name === 'map' ? 'Map' : 'Filter'} (empty list)`, `${name} f [] = []`, []);
        }
        const hof: HofNode = {
          kind: 'hof',
          op: name,
          fn: args[0],
          source: xs.items,
          results: [],
          verdicts: [],
          acc: null,
          index: 0,
          current: this.apply(args[0], [xs.items[0]]),
          label: `${name} ${short(args[0], 26)}`,
          meta: this.meta(`${name} init`, short(redex, 60), [xs.meta.id], 'structure'),
        };
        const rule = name === 'map' ? 'Map Init: light box #0' : 'Filter Init: test box #0';
        return this.out(redex, hof, rule, `${short(redex, 50)} ⇒ [${short(hof.current, 30)}, …]`, toneOf(xs.items[0]));
      }
      case 'fold': {
        this.needFn(args[0], 'fold', redex);
        const xs = this.needList(args[2], 'fold', redex);
        if (xs.items.length === 0) {
          return this.out(redex, args[1], 'Fold (empty list) → accumulator', `fold f ${short(args[1], 12)} [] = ${short(args[1], 12)}`, []);
        }
        const hof: HofNode = {
          kind: 'hof',
          op: 'fold',
          fn: args[0],
          source: xs.items,
          results: [],
          verdicts: [],
          acc: args[1],
          index: 0,
          current: this.apply(args[0], [args[1], xs.items[0]]),
          label: `fold ${short(args[0], 26)}`,
          meta: this.meta('fold init', short(redex, 60), [xs.meta.id], 'structure'),
        };
        this.place(args[1], 'fold accumulator (initial)');
        return this.out(redex, hof, 'Fold Init: acc + box #0', `${short(redex, 50)} ⇒ ${short(hof.current, 40)}`, toneOf(args[1]));
      }
      case 'reverse': {
        const xs = this.needList(args[0], 'reverse', redex);
        const n = xs.items.length;
        const items = xs.items
          .slice()
          .reverse()
          .map((v, j) => this.copy(v, `Reverse (box #${n - 1 - j} → #${j})`, `reverse: position ${n - 1 - j} moves to ${j}`));
        const node = this.list(items, 'Reverse', `reverse ${short(xs, 30)}`, [xs.meta.id], 'reverse');
        items.forEach((it, j) => this.place(it, `reverse box #${j}`));
        return this.out(redex, node, 'Reverse', `reverse ${short(xs, 30)} = ${short(node, 30)}`, items.slice(0, 4).flatMap((v) => (v.kind === 'num' ? [v.value] : [])));
      }
      case 'zip': {
        const xs = this.needList(args[0], 'zip', redex);
        const ys = this.needList(args[1], 'zip', redex);
        const n = Math.min(xs.items.length, ys.items.length);
        const items: Expr[] = [];
        for (let i = 0; i < n; i++) {
          const a = this.copy(xs.items[i], `Zip (left #${i})`, `zip: left box #${i} → pair #${i}.fst`);
          const b = this.copy(ys.items[i], `Zip (right #${i})`, `zip: right box #${i} → pair #${i}.snd`);
          const t: Expr = { kind: 'tuple', items: [a, b], meta: this.meta(`Zip pair #${i}`, `(${short(a, 10)}, ${short(b, 10)})`, [a.meta.id, b.meta.id], 'tuple') };
          this.register(t);
          this.place(a, `zip pair #${i}`);
          this.place(b, `zip pair #${i}`);
          items.push(t);
        }
        const node = this.list(items, 'Zip', `zip ${short(xs, 20)} ${short(ys, 20)}`, [xs.meta.id, ys.meta.id], 'zip');
        return this.out(redex, node, 'Zip', `zip ${short(xs, 20)} ${short(ys, 20)} = ${short(node, 40)}`, []);
      }
      case 'range': {
        const [a, b] = args;
        if (a.kind !== 'num' || b.kind !== 'num' || !Number.isInteger(a.value) || !Number.isInteger(b.value)) {
          throw new FluxRuntimeError('range expects two integers', redex.span);
        }
        const count = b.value - a.value + 1;
        if (count > MAX_RANGE) throw new FluxRuntimeError(`range too large (${count} elements, max ${MAX_RANGE})`, redex.span);
        const items: Expr[] = [];
        for (let k = 0; k < count; k++) {
          const v = a.value + k;
          items.push(this.num(v, `Range element #${k}`, `${fmtNum(a.value)} + ${k} = ${fmtNum(v)}`, [a.meta.id], 'offset', k));
        }
        const node = this.list(items, 'Range', `range ${fmtNum(a.value)} ${fmtNum(b.value)}`, [a.meta.id, b.meta.id], 'range');
        return this.out(redex, node, 'Range Expansion', `range ${fmtNum(a.value)} ${fmtNum(b.value)} = ${short(node, 40)}`, items.slice(0, 4).map((x) => (x as NumNode).value));
      }
      case 'fst':
      case 'snd': {
        const t = args[0];
        if (t.kind !== 'tuple' || t.items.length < 2) throw new FluxRuntimeError(`${name} expects a pair, got ${describe(t)}`, redex.span);
        const v = t.items[name === 'fst' ? 0 : 1];
        return this.out(redex, v, `Projection (${name})`, `${name} ${short(t, 24)} = ${short(v, 16)}`, v.kind === 'num' ? [v.value] : []);
      }
    }
  }

  private hof(h: HofNode): Rewrite {
    if (!isValue(h.current)) {
      const r = this.reduce(h.current) as Rewrite;
      return { ...r, node: { ...h, current: r.node } };
    }
    const cur = h.current;
    const i = h.index;
    const n = h.source.length;
    const tone = cur.kind === 'num' ? [cur.value] : [];
    if (h.op === 'map') {
      this.place(cur, `map box #${i}`);
      const results = [...h.results, cur];
      if (i + 1 < n) {
        const next = this.apply(h.fn, [h.source[i + 1]]);
        const node: HofNode = { ...h, results, index: i + 1, current: next };
        const nt = [...tone, ...toneOf(h.source[i + 1])];
        return this.out(h, node, `Map Step #${i + 1}: box #${i} done, light box #${i + 1}`, `box #${i} := ${short(cur, 16)}; next ${short(next, 36)}`, nt);
      }
      const node = this.list(results, 'Map Complete', `map ${short(h.fn, 24)} = ${prettyString({ kind: 'list', items: results, meta: h.meta }, 40)}`, [h.meta.id], 'map output', h.meta.id);
      return this.out(h, node, 'Map Complete', node.meta.formula, tone);
    }
    if (h.op === 'filter') {
      if (cur.kind !== 'bool') throw new FluxRuntimeError(`filter predicate must return a boolean, got ${describe(cur)}`, h.span);
      const src = h.source[i];
      const verdicts = [...h.verdicts, cur.value];
      let results = h.results;
      let rule: string;
      if (cur.value) {
        const kept = this.copy(src, `Filter keep (box #${i})`, `${short(h.fn, 20)} ${short(src, 10)} = true → keep`, [cur.meta.id]);
        this.place(kept, `filter output box #${results.length}`);
        results = [...results, kept];
        rule = `Filter Step #${i + 1}: keep box #${i}`;
      } else {
        rule = `Filter Step #${i + 1}: drop box #${i}`;
      }
      if (i + 1 < n) {
        const next = this.apply(h.fn, [h.source[i + 1]]);
        const node: HofNode = { ...h, results, verdicts, index: i + 1, current: next };
        return this.out(h, node, rule, `${short(src, 12)} → ${cur.value ? 'kept' : 'dropped'}; next ${short(next, 30)}`, src.kind === 'num' && cur.value ? [src.value] : []);
      }
      const node = this.list(results, 'Filter Complete', `filter ${short(h.fn, 24)} = ${prettyString({ kind: 'list', items: results, meta: h.meta }, 40)}`, [h.meta.id], 'filter output', h.meta.id);
      return this.out(h, node, `${rule} · Filter Complete`, node.meta.formula, src.kind === 'num' && cur.value ? [src.value] : []);
    }
    this.place(cur, `fold accumulator after box #${i}`);
    if (i + 1 < n) {
      const next = this.apply(h.fn, [cur, h.source[i + 1]]);
      const node: HofNode = { ...h, acc: cur, index: i + 1, current: next };
      return this.out(h, node, `Fold Step #${i + 1}: acc ← ${short(cur, 12)}, consume box #${i}`, `acc := ${short(cur, 12)}; next ${short(next, 36)}`, tone);
    }
    return this.out(h, cur, 'Fold Complete', `fold result = ${short(cur, 20)}`, tone);
  }
}

function registerSource(m: Machine, ast: Expr, roles: Map<string, SourceRole>): void {
  const visit = (e: Expr): void => {
    if (e.kind === 'num' || e.kind === 'bool') {
      m.register(e);
      const p = m.prov[e.meta.id];
      const role = roles.get(e.meta.id);
      if (role) p.role = role;
      return;
    }
    switch (e.kind) {
      case 'list':
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
  visit(ast);
}

export interface RunOptions {
  maxSteps?: number;
  lite?: boolean;
}

export function run(source: string, opts: RunOptions = {}): RunResult {
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  let ast: Expr;
  let ids: IdGen;
  try {
    if (tokenize(source).length === 1) return { ok: false, status: 'empty', history: [], provenance: {}, source };
    const parsed = parse(source);
    ast = parsed.ast;
    ids = parsed.ids;
  } catch (err) {
    const flux: FluxError =
      err instanceof FluxSyntaxError ? err.flux : { message: (err as Error).message, phase: 'parse' };
    return { ok: false, status: 'parse-error', history: [], provenance: {}, error: flux, source };
  }

  const m = new Machine(ids);
  registerSource(m, ast, collectSourceRoles(ast, source));

  const snap = (expr: Expr, rw: Rewrite | null): StepSnapshot => ({
    stepIndex: m.step,
    expr,
    activeRedexId: rw ? rw.contractumId : null,
    nextRedexId: null,
    activeRule: rw ? rw.rule : 'Initial Program',
    formula: rw ? rw.formula : 'Step 0: parsed source, every literal tagged with a provenance ID',
    visualStages: opts.lite ? [] : collectStages(expr, m.step),
    provenanceIndex: m.prov,
    tones: rw ? rw.tones.slice(0, 4) : [],
    createdIds: m.created,
  });

  const history: StepSnapshot[] = [snap(ast, null)];
  let expr = ast;
  let status: RunResult['status'] = 'done';
  let error: FluxError | undefined;

  for (;;) {
    m.step = history.length;
    m.created = [];
    let rw: Rewrite | null;
    try {
      rw = m.reduce(expr);
    } catch (err) {
      if (err instanceof FluxRuntimeError) {
        status = 'error';
        error = { message: err.message, phase: 'runtime', span: err.span, step: m.step };
        break;
      }
      throw err;
    }
    if (!rw) break;
    if (history.length - 1 >= maxSteps) {
      status = 'truncated';
      error = { message: `Stopped after ${maxSteps} steps (safety limit)`, phase: 'runtime', step: m.step };
      break;
    }
    history[history.length - 1].nextRedexId = rw.redexId;
    expr = rw.node;
    history.push(snap(expr, rw));
  }
  m.step = history.length - 1;

  return { ok: status === 'done', status, history, provenance: m.prov, error, finalExpr: expr, source };
}

export function evaluate(source: string): unknown {
  const r = run(source);
  if (!r.ok || !r.finalExpr) throw new Error(r.error?.message ?? 'evaluation failed');
  return toJS(r.finalExpr);
}
