import { BUILTIN_ARITY, type Expr } from './types';

export function isValue(e: Expr): boolean {
  switch (e.kind) {
    case 'num':
    case 'bool':
    case 'lam':
    case 'builtin':
      return true;
    case 'list':
    case 'tuple':
      return e.items.every(isValue);
    case 'app':
      return e.fn.kind === 'builtin' && e.args.length < BUILTIN_ARITY[e.fn.name] && e.args.every(isValue);
    default:
      return false;
  }
}
