export interface Span {
  start: number;
  end: number;
  line: number;
  col: number;
}

export type Operator =
  | 'literal'
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | 'compare'
  | 'logic'
  | 'copy'
  | 'offset'
  | 'cons'
  | 'list'
  | 'tuple'
  | 'closure'
  | 'structure';

export interface ProvenanceMeta {
  id: string;
  stepCreated: number;
  rule: string;
  formula: string;
  parentIds: string[];
  sourceAstId?: string;
  operator?: Operator;
  offset?: number;
}

export type BinOpName =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | ':'
  | '&&'
  | '||';

export type BuiltinName = 'map' | 'fold' | 'filter' | 'reverse' | 'zip' | 'range' | 'fst' | 'snd';

export const BUILTIN_ARITY: Record<BuiltinName, number> = {
  map: 2,
  fold: 3,
  filter: 2,
  reverse: 1,
  zip: 2,
  range: 2,
  fst: 1,
  snd: 1,
};

interface NodeBase {
  meta: ProvenanceMeta;
  span?: Span;
}

export interface NumNode extends NodeBase {
  kind: 'num';
  value: number;
}
export interface BoolNode extends NodeBase {
  kind: 'bool';
  value: boolean;
}
export interface ListNode extends NodeBase {
  kind: 'list';
  items: Expr[];
  origin?: string;
}
export interface TupleNode extends NodeBase {
  kind: 'tuple';
  items: Expr[];
}
export interface VarNode extends NodeBase {
  kind: 'var';
  name: string;
}
export interface BuiltinNode extends NodeBase {
  kind: 'builtin';
  name: BuiltinName;
}
export interface LamNode extends NodeBase {
  kind: 'lam';
  params: string[];
  body: Expr;
}
export interface AppNode extends NodeBase {
  kind: 'app';
  fn: Expr;
  args: Expr[];
}
export interface BinOpNode extends NodeBase {
  kind: 'binop';
  op: BinOpName;
  left: Expr;
  right: Expr;
}
export interface IfNode extends NodeBase {
  kind: 'if';
  cond: Expr;
  then: Expr;
  else: Expr;
}
export interface LetNode extends NodeBase {
  kind: 'let';
  name: string;
  value: Expr;
  body: Expr;
}

export interface HofNode extends NodeBase {
  kind: 'hof';
  op: 'map' | 'filter' | 'fold';
  fn: Expr;
  source: Expr[];
  results: Expr[];
  verdicts: boolean[];
  acc: Expr | null;
  index: number;
  current: Expr;
  label: string;
}

export interface GuardNode extends NodeBase {
  kind: 'guard';
  cond: Expr;
  body: Expr;
  branch: 'then' | 'else';
}

export type Expr =
  | GuardNode
  | NumNode
  | BoolNode
  | ListNode
  | TupleNode
  | VarNode
  | BuiltinNode
  | LamNode
  | AppNode
  | BinOpNode
  | IfNode
  | LetNode
  | HofNode;

export type ValueKind = 'num' | 'bool' | 'list' | 'tuple' | 'lam';

export interface SourceRole {
  description: string;
  kind: 'list-element' | 'lambda-constant' | 'let-binding' | 'argument' | 'constant';
}

export interface ProvenanceNode extends ProvenanceMeta {
  value: number | boolean | string;
  kind: ValueKind;
  span?: Span;
  role?: SourceRole;
  placements: string[];
}

export type ProvenanceIndex = Record<string, ProvenanceNode>;

export type CellStatus =
  | 'idle'
  | 'active'
  | 'done'
  | 'pending'
  | 'consumed'
  | 'kept'
  | 'dropped';

export type Cell =
  | { type: 'value'; id: string; value: number | boolean; status: CellStatus }
  | { type: 'tuple'; id: string; items: Cell[]; status: CellStatus }
  | { type: 'row'; id: string; cells: Cell[]; status: CellStatus; label?: string }
  | { type: 'expr'; id: string; text: string; status: CellStatus };

export interface StageRow {
  key: string;
  label: string;
  kind: 'list' | 'map' | 'filter' | 'fold' | 'result' | 'values';
  cells: Cell[];
  acc?: Cell;
  accExpr?: string;
  is2D: boolean;
  firstStep: number;
}

export interface StepSnapshot {
  stepIndex: number;
  expr: Expr;
  activeRedexId: string | null;
  nextRedexId: string | null;
  activeRule: string;
  formula: string;
  visualStages: StageRow[];
  provenanceIndex: ProvenanceIndex;
  tones: number[];
  createdIds: string[];
}

export interface FluxError {
  message: string;
  phase: 'lex' | 'parse' | 'runtime';
  span?: Span;
  step?: number;
}

export interface RunResult {
  ok: boolean;
  status: 'done' | 'error' | 'truncated' | 'parse-error' | 'empty';
  history: StepSnapshot[];
  provenance: ProvenanceIndex;
  error?: FluxError;
  finalExpr?: Expr;
  source: string;
}

export interface PatchStep {
  nodeId: string;
  rule: string;
  explanation: string;
}

export interface Patch {
  id: string;
  title: string;
  description: string;
  literalId: string;
  line: number;
  col: number;
  span: Span;
  oldValue: number;
  newValue: number;
  oldText: string;
  newText: string;
  newCode: string;
  chain: PatchStep[];
  verified: boolean;
  score: number;
  achievedValue: number | null;
  newOutput: string;
}
