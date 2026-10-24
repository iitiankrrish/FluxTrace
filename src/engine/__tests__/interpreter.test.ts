import { describe, expect, it } from 'vitest';
import { collectSourceRoles, parse, tokenize } from '../parser';
import { prettyString } from '../pretty';
import { run, evaluate, toJS, MAX_STEPS } from '../stepper';
import { solveBackward, ancestorLiterals } from '../backwardSolver';
import { ancestors, biography, descendants, sourceRoots } from '../lineage';
import { buildStageTimeline, cellIds } from '../stages';
import { EXAMPLES } from '../examples';

const PRESETS = EXAMPLES.filter((e) => e.id !== 'basics');
import { boxColors, pixelShade, valueHue } from '../colors';
import type { Expr, RunResult } from '../types';
import { DOCS } from '../docs';
import languageMd from '../../../docs/LANGUAGE.md?raw';

const final = (r: RunResult) => (r.finalExpr ? toJS(r.finalExpr) : undefined);
const finalId = (r: RunResult) => r.finalExpr?.meta.id as string;

describe('lexer', () => {
  it('tokenizes numbers, identifiers, keywords and multi-char symbols with spans', () => {
    const toks = tokenize('let x = 42 in \\a b -> a <= b');
    expect(toks.map((t) => t.text)).toEqual(['let', 'x', '=', '42', 'in', '\\', 'a', 'b', '->', 'a', '<=', 'b', '<end of input>']);
    expect(toks[0].type).toBe('kw');
    expect(toks[3]).toMatchObject({ type: 'num', num: 42, span: { start: 8, end: 10, line: 1, col: 9 } });
  });

  it('tracks lines and skips comments', () => {
    const toks = tokenize('-- comment\n  [1, 2] // trailing\n3');
    const three = toks.find((t) => t.text === '3');
    expect(three?.span.line).toBe(3);
    expect(toks.find((t) => t.text === '[')?.span).toMatchObject({ line: 2, col: 3 });
    expect(toks.some((t) => t.text === 'comment')).toBe(false);
  });

  it('lexes decimals and rejects unknown characters', () => {
    expect(tokenize('2.5')[0].num).toBe(2.5);
    expect(() => tokenize('1 $ 2')).toThrow(/Unexpected character/);
  });
});

describe('parser', () => {
  const p = (src: string): Expr => parse(src).ast;

  it('parses literals: integers, negatives, booleans, 1D and 2D lists', () => {
    expect(p('42')).toMatchObject({ kind: 'num', value: 42 });
    expect(p('-5')).toMatchObject({ kind: 'num', value: -5 });
    expect(p('true')).toMatchObject({ kind: 'bool', value: true });
    const l = p('[10, 20, 30]');
    expect(l.kind).toBe('list');
    expect(l.kind === 'list' && l.items.map((x) => (x as { value: number }).value)).toEqual([10, 20, 30]);
    const m = p('[[1, 0], [0, 1]]');
    expect(m.kind === 'list' && m.items.every((r) => r.kind === 'list' && r.items.length === 2)).toBe(true);
    expect(p('[]')).toMatchObject({ kind: 'list', items: [] });
  });

  it('parses let (chained, layout-style and function sugar)', () => {
    const chained = p('let x = 1 in let y = 2 in x + y');
    expect(chained).toMatchObject({ kind: 'let', name: 'x', body: { kind: 'let', name: 'y' } });
    const layout = p('let x = [1, 2]\n    y = 3\nin y');
    expect(layout).toMatchObject({ kind: 'let', name: 'x', value: { kind: 'list' }, body: { kind: 'let', name: 'y' } });
    const sugar = p('let double x = x * 2 in double 4');
    expect(sugar).toMatchObject({ kind: 'let', name: 'double', value: { kind: 'lam', params: ['x'] } });
  });

  it('parses single and curried lambdas', () => {
    expect(p('\\x -> x')).toMatchObject({ kind: 'lam', params: ['x'], body: { kind: 'var', name: 'x' } });
    expect(p('\\acc x -> acc + x')).toMatchObject({ kind: 'lam', params: ['acc', 'x'], body: { kind: 'binop', op: '+' } });
  });

  it('parses builtins map, fold, filter, reverse, zip, range as applications', () => {
    expect(p('map (\\x -> x * 2) [1, 2]')).toMatchObject({ kind: 'app', fn: { kind: 'builtin', name: 'map' }, args: [{ kind: 'lam' }, { kind: 'list' }] });
    expect(p('fold (\\a x -> a + x) 0 xs')).toMatchObject({ kind: 'app', fn: { name: 'fold' }, args: [{}, { value: 0 }, { name: 'xs' }] });
    expect(p('filter (\\x -> x > 1) xs')).toMatchObject({ fn: { name: 'filter' } });
    expect(p('reverse xs')).toMatchObject({ fn: { name: 'reverse' } });
    expect(p('zip a b')).toMatchObject({ fn: { name: 'zip' }, args: [{ name: 'a' }, { name: 'b' }] });
    expect(p('range 1 6')).toMatchObject({ fn: { name: 'range' }, args: [{ value: 1 }, { value: 6 }] });
  });

  it('respects operator precedence and associativity', () => {
    expect(prettyString(p('1 + 2 * 3'))).toBe('1 + 2 * 3');
    expect(p('1 + 2 * 3')).toMatchObject({ op: '+', right: { op: '*' } });
    expect(p('10 - 3 - 2')).toMatchObject({ op: '-', left: { op: '-' } });
    expect(p('1 : 2 : []')).toMatchObject({ op: ':', right: { op: ':' } });
    expect(p('a + 1 > b * 2')).toMatchObject({ op: '>', left: { op: '+' }, right: { op: '*' } });
    expect(p('f x + g y')).toMatchObject({ op: '+', left: { kind: 'app' }, right: { kind: 'app' } });
  });

  it('parses if, tuples and operator sections', () => {
    expect(p('if x > 1 then 1 else 0')).toMatchObject({ kind: 'if', cond: { op: '>' } });
    expect(p('(1, true)')).toMatchObject({ kind: 'tuple', items: [{ value: 1 }, { value: true }] });
    expect(p('(+)')).toMatchObject({ kind: 'lam', params: ['_a', '_b'] });
  });

  it('records source spans on literals and assigns unique IDs', () => {
    const src = 'let xs = [10, 20] in xs';
    const { ast } = parse(src);
    const ids = new Set<string>();
    const walk = (e: Expr): void => {
      expect(ids.has(e.meta.id)).toBe(false);
      ids.add(e.meta.id);
      if (e.kind === 'let') {
        walk(e.value);
        walk(e.body);
      }
      if (e.kind === 'list') e.items.forEach(walk);
    };
    walk(ast);
    const twenty = ast.kind === 'let' && ast.value.kind === 'list' ? ast.value.items[1] : null;
    expect(twenty?.span && src.slice(twenty.span.start, twenty.span.end)).toBe('20');
    expect(twenty?.meta).toMatchObject({ stepCreated: 0, rule: 'Source Literal', sourceAstId: twenty?.meta.id });
  });

  it('describes literal roles for patch messages', () => {
    const src = 'let xs = [1, 2] in map (\\x -> x * 3) xs';
    const { ast } = parse(src);
    const roles = [...collectSourceRoles(ast, src).values()].map((r) => r.kind);
    expect(roles).toEqual(['list-element', 'list-element', 'lambda-constant']);
  });

  it('reports syntax errors with locations', () => {
    expect(() => parse('let x = in 3')).toThrow(/line 1/);
    expect(() => parse('[1, 2')).toThrow(/Expected '\]'/);
    expect(() => parse('let map = 1 in map')).toThrow(/built-in/);
    expect(run('(1 +').status).toBe('parse-error');
  });
});

describe('small-step reducer', () => {
  it('evaluates arithmetic, comparison, if, let and lambdas correctly', () => {
    expect(evaluate('1 + 2 * 3')).toBe(7);
    expect(evaluate('(1 + 2) * 3')).toBe(9);
    expect(evaluate('7 % 3')).toBe(1);
    expect(evaluate('9 / 2')).toBe(4.5);
    expect(evaluate('if 3 > 2 then 10 else 20')).toBe(10);
    expect(evaluate('let x = 5 in x * x')).toBe(25);
    expect(evaluate('(\\x y -> x - y) 10 4')).toBe(6);
    expect(evaluate('let add a b = a + b in let inc = add 1 in inc 41')).toBe(42);
    expect(evaluate('1 == 1 && 2 != 3')).toBe(true);
    expect(evaluate('1 : [2, 3]')).toEqual([1, 2, 3]);
  });

  it('runs map, fold, filter, reverse, zip and range', () => {
    expect(evaluate('map (\\x -> x * 2) [1, 2, 3]')).toEqual([2, 4, 6]);
    expect(evaluate('fold (\\acc x -> acc + x) 0 [1, 2, 3, 4]')).toBe(10);
    expect(evaluate('fold (\\acc x -> acc - x) 10 [1, 2]')).toBe(7);
    expect(evaluate('filter (\\x -> x > 15) [10, 20, 5, 30]')).toEqual([20, 30]);
    expect(evaluate('reverse [1, 2, 3]')).toEqual([3, 2, 1]);
    expect(evaluate('zip [1, 2, 3] [4, 5]')).toEqual([[1, 4], [2, 5]]);
    expect(evaluate('range 1 6')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(evaluate('fold (+) 0 (range 1 10)')).toBe(55);
    expect(evaluate('map (map (\\x -> x + 1)) [[1, 2], [3, 4]]')).toEqual([[2, 3], [4, 5]]);
    expect(evaluate('map fst (zip [1, 2] [true, false])')).toEqual([1, 2]);
    expect(evaluate('map (\\x -> x) []')).toEqual([]);
    expect(evaluate('fold (+) 99 []')).toBe(99);
  });

  it('performs exactly one rewrite per step with the expected step count', () => {
    const r = run('map (\\x -> x * 2) [10, 20, 30]');
    expect(r.history.length - 1).toBe(1 + 6 + 2 + 1);
    expect(r.history.map((s) => s.activeRule.split(':')[0].split(' (')[0])).toEqual([
      'Initial Program',
      'Map Init',
      'Beta-Reduction',
      'Arithmetic',
      'Map Step #1',
      'Beta-Reduction',
      'Arithmetic',
      'Map Step #2',
      'Beta-Reduction',
      'Arithmetic',
      'Map Complete',
    ]);
    const fold = run('fold (\\acc x -> acc + x) 0 [1, 2, 3]');
    expect(fold.history.length - 1).toBe(1 + 6 + 2 + 1);
  });

  it('rewrites map in place element by element (box i lights up)', () => {
    const r = run('map (\\x -> x * 2) [10, 20, 30]');
    const states = r.history.map((s) => prettyString(s.expr));
    expect(states[1]).toBe('map (\\x -> x * 2) ▸ [(\\x -> x * 2) 10, 20, 30]');
    expect(states[3]).toBe('map (\\x -> x * 2) ▸ [20, 20, 30]');
    expect(states[4]).toBe('map (\\x -> x * 2) ▸ [20, (\\x -> x * 2) 20, 30]');
    const row = r.history[4].visualStages[0];
    expect(row.kind).toBe('map');
    expect(row.cells.map((c) => c.status)).toEqual(['done', 'active', 'pending']);
  });

  it('shows the fold accumulator box alongside the list row', () => {
    const r = run('fold (\\acc x -> acc + x) 0 [5, 6, 7]');
    const s = r.history.find((h) => h.activeRule.startsWith('Fold Step #1')) as (typeof r.history)[number];
    const row = s.visualStages[0];
    expect(row.kind).toBe('fold');
    expect(row.acc).toMatchObject({ type: 'value', value: 5 });
    expect(row.cells.map((c) => c.status)).toEqual(['consumed', 'active', 'pending']);
  });

  it('is deterministic: same program → identical history and IDs', () => {
    const src = PRESETS[0].code;
    const a = run(src);
    const b = run(src);
    expect(a.history.length).toBe(b.history.length);
    a.history.forEach((s, i) => {
      expect(prettyString(s.expr)).toBe(prettyString(b.history[i].expr));
      expect(s.activeRedexId).toBe(b.history[i].activeRedexId);
      expect(s.activeRule).toBe(b.history[i].activeRule);
    });
    expect(Object.keys(a.provenance)).toEqual(Object.keys(b.provenance));
  });

  it('links each snapshot to the next redex and stops at a value', () => {
    const r = run('(1 + 2) * (3 + 4)');
    expect(r.history.map((s) => prettyString(s.expr))).toEqual(['(1 + 2) * (3 + 4)', '3 * (3 + 4)', '3 * 7', '21']);
    expect(r.history[0].nextRedexId).toBeTruthy();
    expect(r.history[r.history.length - 1].nextRedexId).toBeNull();
    expect(r.status).toBe('done');
  });

  it('enforces the 300-step safety limit', () => {
    const r = run('fold (\\a x -> a + x) 0 (range 1 500)');
    expect(r.status).toBe('truncated');
    expect(r.history.length - 1).toBe(MAX_STEPS);
  });

  it('reports runtime errors with the failing step', () => {
    const r = run('let x = 5 in x / 0');
    expect(r.status).toBe('error');
    expect(r.error?.message).toMatch(/Division by zero/);
    expect(r.error?.step).toBe(r.history.length);
    expect(run('y + 1').error?.message).toMatch(/Unbound variable 'y'/);
    expect(run('map 3 [1]').error?.message).toMatch(/expects a function/);
    expect(run('1 + true').error?.message).toMatch(/needs numbers/);
  });

  it('runs the basics example: let, lambda, if, cons and range', () => {
    const r = run(EXAMPLES[0].code);
    expect(r.status).toBe('done');
    expect(final(r)).toEqual([19, 26, 35, 46]);
  });

  it('runs all 5 presets to completion within the step budget', () => {
    const expected = [200, 79, 605, [48, 50, 48], [[25, 45, 65], [85, 105, 125], [145, 165, 185]]];
    PRESETS.forEach((preset, i) => {
      const r = run(preset.code);
      expect(r.status, preset.name).toBe('done');
      expect(final(r)).toEqual(expected[i]);
      expect(r.history.length).toBeLessThanOrEqual(MAX_STEPS + 1);
    });
  });
});

describe('provenance lineage', () => {
  it('records parentIds, rule and formula for a + b = c', () => {
    const r = run('10 + 20');
    const out = r.provenance[finalId(r)];
    const ast = r.history[0].expr as Extract<Expr, { kind: 'binop' }>;
    expect(out.parentIds).toEqual([ast.left.meta.id, ast.right.meta.id]);
    expect(out.rule).toBe('Arithmetic (+)');
    expect(out.formula).toBe('10 + 20 = 30');
    expect(out.stepCreated).toBe(1);
  });

  it('traces the final fold output back to every Step-0 input element', () => {
    const r = run(PRESETS[0].code);
    const roots = sourceRoots(r.provenance, finalId(r)).map((n) => n.value);
    expect(roots).toEqual(expect.arrayContaining([10, 20, 30, 40, 2, 0]));
    for (const id of ancestors(r.provenance, finalId(r))) {
      expect(r.provenance[id].stepCreated).toBeLessThan(r.provenance[finalId(r)].stepCreated);
    }
  });

  it('traces a mapped box to exactly its input element and the lambda constant', () => {
    const r = run('map (\\x -> x * 2) [10, 20, 30]');
    const out = r.finalExpr as Extract<Expr, { kind: 'list' }>;
    const box1 = out.items[1];
    const roots = sourceRoots(r.provenance, box1.meta.id).map((n) => n.value).sort();
    expect(roots).toEqual([2, 20]);
    expect(r.provenance[box1.meta.id].placements[0]).toMatch(/map box #1/);
  });

  it('preserves provenance IDs through let substitution', () => {
    const r = run('let x = 7 in x + 1');
    const lit = (r.history[0].expr as Extract<Expr, { kind: 'let' }>).value;
    expect(r.provenance[finalId(r)].parentIds[0]).toBe(lit.meta.id);
  });

  it('links filter / reverse / zip copies to their upstream boxes', () => {
    const r = run(PRESETS[3].code);
    const out = r.finalExpr as Extract<Expr, { kind: 'list' }>;
    const roots = sourceRoots(r.provenance, out.items[0].meta.id)
      .filter((n) => n.role?.kind === 'list-element')
      .map((n) => n.value)
      .sort((a, b) => (a as number) - (b as number));
    expect(roots).toEqual([18, 30]);
    const rules = biography(r.provenance, out.items[0].meta.id).map((b) => b.node.rule);
    expect(rules.some((x) => x.startsWith('Reverse'))).toBe(true);
    expect(rules.some((x) => x.startsWith('Zip'))).toBe(true);
    expect(rules.some((x) => x.startsWith('Filter keep'))).toBe(true);
  });

  it('computes descendants of an input element down to the final result', () => {
    const r = run(PRESETS[0].code);
    const twenty = Object.values(r.provenance).find((n) => n.stepCreated === 0 && n.value === 20) as { id: string };
    expect(descendants(r.provenance, twenty.id).has(finalId(r))).toBe(true);
  });

  it('builds a stage timeline whose rows connect input → map → fold', () => {
    const r = run(PRESETS[0].code);
    const rows = buildStageTimeline(r.history, r.history.length - 1);
    expect(rows.map((x) => x.kind)).toEqual(['values', 'list', 'map', 'fold', 'result']);
    expect(rows[0].cells.map((c) => (c.type === 'value' ? c.value : null))).toEqual([0]);
    expect(rows[1].label).toBe('xs');
    const visible = new Set(rows.flatMap((row) => [...row.cells.flatMap((c) => cellIds(c)), ...(row.acc ? cellIds(row.acc) : [])]));
    const lineage = ancestors(r.provenance, finalId(r));
    const onStageAncestors = [...lineage].filter((id) => visible.has(id));
    expect(onStageAncestors.length).toBeGreaterThanOrEqual(8);
    expect(rows[rows.length - 1].isOutput).toBe(true);
  });

  it('flags 2D lists for pixel-grid rendering', () => {
    const r = run(PRESETS[4].code);
    const rows = buildStageTimeline(r.history, r.history.length - 1);
    expect(rows.find((x) => x.label === 'image')?.is2D).toBe(true);
    expect(rows.find((x) => x.kind === 'map')?.is2D).toBe(true);
  });
});

describe('stage + lineage coverage for every construct', () => {
  const visibleAt = (r: RunResult) =>
    new Set(buildStageTimeline(r.history, r.history.length - 1).flatMap((row) => [...row.cells.flatMap((c) => cellIds(c)), ...(row.acc ? cellIds(row.acc) : [])]));
  const rootValues = (r: RunResult, id: string) => sourceRoots(r.provenance, id).map((n) => n.value).sort();

  it.each([
    ['arithmetic', '(1 + 2) * (3 + 4)', 21, [1, 2, 3, 4]],
    ['let', 'let x = 5 in x * x + 1', 26, [1, 5]],
    ['lambda', '(\\a b -> a * 10 + b) 4 2', 42, [10, 2, 4].sort()],
    ['fst / snd', 'snd (fst (1, 2), 3)', 3, [3]],
  ] as const)('%s: scalar steps are boxed on the values row and trace to their literals', (_n, src, value, roots) => {
    const r = run(src);
    expect(final(r)).toBe(value);
    const vis = visibleAt(r);
    const parents = r.provenance[finalId(r)].parentIds;
    parents.forEach((p) => expect(vis.has(p)).toBe(true));
    expect(rootValues(r, finalId(r))).toEqual([...roots].sort());
  });

  it('if: the result depends on the condition as well as the taken branch', () => {
    const r = run('let t = 7 in if t > 5 then t * 2 else 0');
    expect(final(r)).toBe(14);
    expect(rootValues(r, finalId(r))).toEqual([2, 5, 7]);
    const rules = biography(r.provenance, finalId(r)).map((b) => b.node.rule);
    expect(rules).toContain('If result (then-branch)');
    expect(rules).toContain('Comparison (>)');
  });

  it('if with an already-evaluated branch also records the condition', () => {
    const r = run('if 3 > 2 then 10 else 20');
    expect(rootValues(r, finalId(r))).toEqual([10, 2, 3]);
  });

  it('cons, range, filter, reverse and zip produce rows whose boxes trace upstream', () => {
    const cases: [string, number[][]][] = [
      ['let x = 9 in x : [1, 2]', [[9], [1], [2]]],
      ['range 3 6', [[3], [3], [3], [3]]],
      ['filter (\\x -> x > 2) [1, 5, 2, 8]', [[2, 5], [2, 8]]],
      ['reverse [1, 2, 3]', [[3], [2], [1]]],
    ];
    for (const [src, roots] of cases) {
      const r = run(src);
      const out = r.finalExpr as Extract<Expr, { kind: 'list' }>;
      const rows = buildStageTimeline(r.history, r.history.length - 1);
      expect(rows.some((row) => row.isOutput), src).toBe(true);
      out.items.forEach((it, i) => expect(rootValues(r, it.meta.id), src).toEqual(roots[i].sort()));
    }
    const z = run('zip [1, 2] [3, 4]');
    const pair = (z.finalExpr as Extract<Expr, { kind: 'list' }>).items[1] as Extract<Expr, { kind: 'tuple' }>;
    expect(rootValues(z, pair.items[0].meta.id)).toEqual([2]);
    expect(rootValues(z, pair.items[1].meta.id)).toEqual([4]);
  });
});

describe('counterfactual backward solver', () => {
  const solveAndVerify = (src: string, pickId: (r: RunResult) => string, target: number) => {
    const r = run(src);
    const id = pickId(r);
    const patches = solveBackward(id, target, r.provenance, src, { finalId: finalId(r) });
    return { r, id, patches };
  };

  it('solves a + b backwards to either operand', () => {
    const { patches } = solveAndVerify('10 + 20', finalId, 50);
    const changes = patches.map((p) => `${p.oldText}→${p.newText}`).sort();
    expect(changes).toEqual(['10→30', '20→40']);
    patches.forEach((p) => {
      expect(p.verified).toBe(true);
      expect(evaluate(p.newCode)).toBe(50);
    });
  });

  it('handles -, * and / inverses', () => {
    for (const [src, target] of [
      ['100 - 30', 50],
      ['6 * 7', 84],
      ['90 / 3', 45],
      ['(2 + 3) * 4 - 1', 99],
    ] as const) {
      const { patches } = solveAndVerify(src, finalId, target);
      expect(patches.length).toBeGreaterThan(0);
      patches.filter((p) => p.verified).forEach((p) => expect(evaluate(p.newCode)).toBeCloseTo(target, 9));
    }
  });

  it('traces through map to the input element OR the lambda constant (intermediate box)', () => {
    const src = 'map (\\x -> x * 2) [10, 20, 30]';
    const { patches } = solveAndVerify(src, (r) => (r.finalExpr as Extract<Expr, { kind: 'list' }>).items[1].meta.id, 50);
    const verified = patches.filter((p) => p.verified);
    expect(verified.map((p) => p.title)).toEqual(
      expect.arrayContaining(['Change input list element 20 → 25', 'Change lambda multiplier 2 → 2.5']),
    );
    for (const p of verified) {
      const out = evaluate(p.newCode) as number[];
      expect(out[1]).toBe(50);
    }
  });

  it('traces through fold accumulators to any input element', () => {
    const src = PRESETS[0].code;
    const { patches } = solveAndVerify(src, finalId, 220);
    const verified = patches.filter((p) => p.verified);
    expect(verified.length).toBeGreaterThanOrEqual(5);
    expect(verified.map((p) => p.title)).toEqual(expect.arrayContaining(['Change input list element 10 → 20', 'Change input list element 40 → 50']));
    verified.forEach((p) => expect(evaluate(p.newCode)).toBe(220));
  });

  it('applying a generated patch reproduces the target value when re-evaluated (Bug Hunter)', () => {
    const src = PRESETS[2].code;
    const { patches } = solveAndVerify(src, finalId, 715);
    const fix = patches.find((p) => p.oldText === '-50');
    expect(fix).toBeDefined();
    expect(fix?.newText).toBe('50');
    expect(fix?.verified).toBe(true);
    expect(fix?.line).toBe(3);
    expect(evaluate(fix!.newCode)).toBe(715);
    expect(fix!.newCode).toContain('[100, 200, 50, 300]');
    expect(patches[0].oldText).toBe('-50');
  });

  it('solves shared lambda constants with verified secant refinement', () => {
    const src = 'fold (\\acc x -> acc + x) 0 (map (\\x -> x * 2) [10, 20, 30])';
    const { patches } = solveAndVerify(src, finalId, 180);
    const lam = patches.find((p) => p.title.includes('lambda multiplier'));
    expect(lam?.verified).toBe(true);
    expect(lam?.newValue).toBe(3);
    expect(evaluate(lam!.newCode)).toBe(180);
  });

  it('wraps negative replacements safely and never returns unverified patches as verified', () => {
    const src = 'range 1 4';
    const r = run(src);
    const first = (r.finalExpr as Extract<Expr, { kind: 'list' }>).items[2].meta.id;
    const patches = solveBackward(first, -1, r.provenance, src, { finalId: finalId(r) });
    const p = patches.find((x) => x.verified);
    expect(p?.newText).toBe('(-3)');
    expect((evaluate(p!.newCode) as number[])[2]).toBe(-1);
    expect(ancestorLiterals(r.provenance, first)).toHaveLength(1);
  });

  it('every verified patch on every preset actually hits its target', () => {
    for (const preset of PRESETS.slice(0, 4)) {
      const r = run(preset.code);
      if (r.finalExpr?.kind !== 'num') continue;
      const target = r.finalExpr.value + 10;
      const patches = solveBackward(finalId(r), target, r.provenance, preset.code, { finalId: finalId(r) });
      expect(patches.some((p) => p.verified), preset.name).toBe(true);
      patches.filter((p) => p.verified).forEach((p) => expect(evaluate(p.newCode)).toBeCloseTo(target, 5));
    }
  });
});

describe('colour mapping', () => {
  it('gives values 12 apart the same hue and distinct neighbours different hues', () => {
    expect(valueHue(60)).toBe(valueHue(72));
    expect(valueHue(60)).not.toBe(valueHue(61));
    expect(boxColors(true).fill).not.toBe(boxColors(false).fill);
  });

  it('shades pixels from light to dark across the grid range', () => {
    const light = pixelShade(0, 0, 100).fill;
    const dark = pixelShade(100, 0, 100).fill;
    expect(light).toMatch(/94%\)$/);
    expect(dark).toMatch(/44%\)$/);
    expect(pixelShade(5, 5, 5).fill).toMatch(/69%\)$/);
  });
});

describe('empty programs', () => {
  it('treats comment-only or blank source as empty, not a parse error', () => {
    for (const src of ['// write your code\n', '-- notes only', '', '  \n\n']) {
      const r = run(src);
      expect(r.status).toBe('empty');
      expect(r.error).toBeUndefined();
      expect(r.history).toHaveLength(0);
    }
  });

  it('still runs code that follows a // comment', () => {
    expect(run('// write your code\n1 + 2').finalExpr).toMatchObject({ kind: 'num', value: 3 });
  });
});

describe('language reference', () => {
  const outcome = (code: string) => {
    const r = run(code);
    return r.status === 'done' ? prettyString(r.finalExpr!) : `error: ${r.error?.message}`;
  };

  it('every in-app docs example gives its stated result', () => {
    for (const section of DOCS) {
      for (const entry of section.entries) {
        for (const ex of entry.examples) {
          expect(outcome(ex.code), `${section.title} › ${entry.title}: ${ex.code}`).toBe(ex.result);
        }
      }
    }
  });

  it('every example in docs/LANGUAGE.md gives its stated result', () => {
    const blocks = [...languageMd.matchAll(/```haskell\n([\s\S]*?)\n```\n(?:→|Result:) `([^`]*)`/g)];
    expect(blocks.length).toBeGreaterThan(40);
    for (const [, code, result] of blocks) expect(outcome(code), code).toBe(result);
  });
});
