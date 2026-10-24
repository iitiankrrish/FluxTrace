export interface DocExample {
  code: string;
  result: string;
}

export interface DocEntry {
  title: string;
  signature?: string;
  text: string;
  examples: DocExample[];
}

export interface DocSection {
  id: string;
  title: string;
  intro?: string;
  entries: DocEntry[];
}

export const PRECEDENCE: { ops: string; assoc: string; note: string }[] = [
  { ops: 'f x y', assoc: 'left', note: 'function application binds tightest' },
  { ops: '*  /  %', assoc: 'left', note: 'multiply, divide, modulo' },
  { ops: '+  -', assoc: 'left', note: 'add, subtract' },
  { ops: ':', assoc: 'right', note: 'cons onto a list' },
  { ops: '==  !=  <  >  <=  >=', assoc: 'left', note: 'comparison' },
  { ops: '&&', assoc: 'left', note: 'and' },
  { ops: '||', assoc: 'left', note: 'or (loosest)' },
];

export const DOCS: DocSection[] = [
  {
    id: 'basics',
    title: 'Basics',
    intro: 'A program is one expression. FluxTrace reduces it one small step at a time until only a value is left, and that value is the output.',
    entries: [
      {
        title: 'A program is an expression',
        text: 'There are no statements, no main and no printing. Write the expression you want evaluated. Line breaks and indentation are free, except inside `let` (see below).',
        examples: [
          { code: '1 + 2 * 3', result: '7' },
          { code: 'map (\\x -> x * x) [1, 2, 3]', result: '[1, 4, 9]' },
        ],
      },
      {
        title: 'Comments',
        text: 'Both `--` and `//` start a comment that runs to the end of the line. A tab with only comments is treated as empty, not as an error.',
        examples: [{ code: '-- Haskell style\n// or C style\n10 * 4 + 2 -- trailing comments work too', result: '42' }],
      },
      {
        title: 'Names',
        text: 'Variable names start with a letter or `_`, and can contain letters, digits, `_` and `\'`. Names are case-sensitive. The keywords `let`, `in`, `if`, `then`, `else`, `true` and `false`, and the built-in function names, cannot be used as variable names.',
        examples: [{ code: "let price_2 = 5\n    price' = price_2 * 2\nin price'", result: '10' }],
      },
    ],
  },
  {
    id: 'values',
    title: 'Values',
    entries: [
      {
        title: 'Numbers',
        text: 'Whole numbers and decimals. A minus sign directly in front of a digit makes a negative literal. There is no scientific notation, and a decimal needs digits on both sides of the point (`0.5`, not `.5`). Results are rounded to 12 significant digits, so `0.1 + 0.2` is exactly `0.3`. The output view shows at most 6 decimals.',
        examples: [
          { code: '[42, 3.75, -7, 0.5]', result: '[42, 3.75, -7, 0.5]' },
          { code: '0.1 + 0.2', result: '0.3' },
        ],
      },
      {
        title: 'Booleans',
        text: '`true` and `false`, in lowercase. Comparisons produce them, and `if` and `filter` need them.',
        examples: [{ code: '[true, false, 3 > 2]', result: '[true, false, true]' }],
      },
      {
        title: 'Lists',
        text: 'Square brackets with comma-separated items. Lists can be empty, nested (a list of rows shows up as a 2D pixel grid) and can hold any value, including booleans and pairs.',
        examples: [
          { code: '[]', result: '[]' },
          { code: '[[1, 2, 3], [4, 5, 6]]', result: '[[1, 2, 3], [4, 5, 6]]' },
        ],
      },
      {
        title: 'Pairs and tuples',
        text: 'Round brackets with commas. `zip` produces pairs, and `fst` and `snd` read the first and second component.',
        examples: [
          { code: '(1, true)', result: '(1, true)' },
          { code: 'snd (3, 4)', result: '4' },
        ],
      },
      {
        title: 'Not supported',
        text: 'There are no strings, characters, records or user-defined types. `True` with a capital T is just an unknown name.',
        examples: [{ code: 'True', result: "error: Unbound variable 'True'" }],
      },
    ],
  },
  {
    id: 'operators',
    title: 'Operators',
    intro: 'All operators are infix. The precedence table below goes from tightest to loosest; use parentheses whenever in doubt.',
    entries: [
      {
        title: 'Arithmetic',
        signature: '+  -  *  /  %',
        text: '`/` is real division (`7 / 2` is `3.5`). `%` is a modulo whose result has the sign of the divisor, as in Haskell\'s `mod`, so `-7 % 3` is `2`. Dividing by zero is a runtime error.',
        examples: [
          { code: '[7 / 2, 7 % 3, -7 % 3]', result: '[3.5, 1, 2]' },
          { code: '2 + 3 * 4', result: '14' },
          { code: '(2 + 3) * 4', result: '20' },
          { code: '10 - 3 - 2', result: '5' },
        ],
      },
      {
        title: 'Negation',
        text: 'A minus in front of an expression negates it. When passing a negative number to a function, wrap it in parentheses: `f -3` means `f` minus `3`.',
        examples: [
          { code: 'let x = 4 in -x', result: '-4' },
          { code: 'let half x = x / 2 in half (-3)', result: '-1.5' },
        ],
      },
      {
        title: 'Comparison',
        signature: '==  !=  <  >  <=  >=',
        text: '`<` `>` `<=` `>=` compare numbers. `==` and `!=` compare any two values, including whole lists and pairs.',
        examples: [
          { code: '[3 < 5, 3 >= 5, 2 != 2]', result: '[true, false, false]' },
          { code: '[1, 2] == [1, 2]', result: 'true' },
        ],
      },
      {
        title: 'Logic',
        signature: '&&  ||',
        text: 'Both sides must be booleans. `&&` binds tighter than `||`. There is no `not`; write `x == false` instead.',
        examples: [{ code: 'true && false || true', result: 'true' }],
      },
      {
        title: 'Cons',
        signature: 'x : list',
        text: 'Puts a value in front of a list. It is right-associative and looser than arithmetic, so `1 + 1 : [5]` means `(1 + 1) : [5]`.',
        examples: [
          { code: '1 : 2 : [3]', result: '[1, 2, 3]' },
          { code: '1 + 1 : [5]', result: '[2, 5]' },
        ],
      },
      {
        title: 'Operator sections',
        signature: '(+)  (*)  (:)  (==)  …',
        text: 'Any operator in parentheses becomes a two-argument function, which is handy with `fold`.',
        examples: [
          { code: 'fold (+) 0 [1, 2, 3, 4]', result: '10' },
          { code: '(-) 10 4', result: '6' },
        ],
      },
    ],
  },
  {
    id: 'let',
    title: 'let … in',
    entries: [
      {
        title: 'Bindings',
        signature: 'let name = value in body',
        text: 'Gives a name to a value inside the body. A later binding can use the earlier ones.',
        examples: [{ code: 'let x = 5 in x * x + 1', result: '26' }],
      },
      {
        title: 'Several bindings',
        text: 'Put each binding on its own line, or separate them with `;` or `,` on one line. A new binding must start on a fresh line (or right after `;` or `,`), which is how FluxTrace tells it apart from a function call.',
        examples: [
          { code: 'let base = 3\n    bonus = base * 10\n    nums = [1, 2]\nin map (\\n -> n + bonus) nums', result: '[31, 32]' },
          { code: 'let a = 2; b = 5 in a * b', result: '10' },
        ],
      },
      {
        title: 'Function shorthand',
        signature: 'let f x y = body',
        text: 'Parameters after the name are shorthand for a lambda: `let f x = e` is the same as `let f = \\x -> e`.',
        examples: [{ code: 'let add x y = x + y in add 2 3', result: '5' }],
      },
      {
        title: 'No recursion',
        text: 'A binding cannot refer to itself, so recursive functions are not possible. Use `map`, `filter`, `fold` and `range` for repetition. An inner `let` can shadow an outer name.',
        examples: [
          { code: 'let x = 1 in let x = x + 10 in x', result: '11' },
          { code: 'let f n = if n == 0 then 0 else f (n - 1) in f 3', result: "error: Unbound variable 'f'" },
        ],
      },
    ],
  },
  {
    id: 'functions',
    title: 'Functions',
    entries: [
      {
        title: 'Lambdas',
        signature: '\\x -> body   \\a b -> body',
        text: 'A backslash, one or more parameter names, an arrow and a body. The body reaches as far right as possible, so wrap a lambda in parentheses when something follows it.',
        examples: [
          { code: '(\\x -> x * x) 5', result: '25' },
          { code: '(\\a b -> a - b) 10 4', result: '6' },
        ],
      },
      {
        title: 'Application',
        signature: 'f x y',
        text: 'Call a function by writing its arguments after it, separated by spaces, with no parentheses or commas. Wrap any argument that is not a single name, number or bracketed value in parentheses.',
        examples: [{ code: 'let area w h = w * h in area 3 (2 + 2)', result: '12' }],
      },
      {
        title: 'Partial application',
        text: 'Give a function fewer arguments than it takes and you get a function waiting for the rest. This works for lambdas, operator sections and built-ins.',
        examples: [
          { code: 'let add = \\a b -> a + b\n    inc = add 1\nin inc 41', result: '42' },
          { code: 'let double = map (\\x -> x * 2) in double [1, 2, 3]', result: '[2, 4, 6]' },
        ],
      },
    ],
  },
  {
    id: 'if',
    title: 'if … then … else',
    entries: [
      {
        title: 'Conditionals',
        signature: 'if cond then a else b',
        text: 'The condition must be a boolean, and `else` is required. Only the chosen branch is evaluated, and in the data flow the result keeps the condition as one of its parents.',
        examples: [
          { code: 'if 2 > 1 then 10 else 20', result: '10' },
          { code: 'map (\\x -> if x > 2 then x else 0) [1, 2, 3, 4]', result: '[0, 0, 3, 4]' },
          { code: 'if 1 then 2 else 3', result: 'error: if-condition must be a boolean, got a number' },
        ],
      },
    ],
  },
  {
    id: 'builtins',
    title: 'Built-in functions',
    intro: 'Eight built-ins cover all repetition. Their names are reserved.',
    entries: [
      {
        title: 'map',
        signature: 'map f list',
        text: 'Applies `f` to every element and returns the new list. Each box lights up in place as it is computed.',
        examples: [
          { code: 'map (\\x -> x + 1) [1, 2, 3]', result: '[2, 3, 4]' },
          { code: 'map (\\row -> map (\\x -> x * 10) row) [[1, 2], [3, 4]]', result: '[[10, 20], [30, 40]]' },
        ],
      },
      {
        title: 'filter',
        signature: 'filter pred list',
        text: 'Keeps the elements for which `pred` returns `true`. `pred` must return a boolean.',
        examples: [{ code: 'filter (\\x -> x % 2 == 0) (range 1 10)', result: '[2, 4, 6, 8, 10]' }],
      },
      {
        title: 'fold',
        signature: 'fold f start list',
        text: 'A left fold: starting from the accumulator `start`, it calls `f acc x` for each element from left to right, and returns the final accumulator. The function takes the accumulator first.',
        examples: [
          { code: 'fold (\\acc x -> acc + x) 0 [1, 2, 3, 4]', result: '10' },
          { code: 'fold (\\best x -> if x > best then x else best) 0 [3, 9, 2]', result: '9' },
          { code: 'fold (\\acc x -> x : acc) [] [1, 2, 3]', result: '[3, 2, 1]' },
        ],
      },
      {
        title: 'reverse',
        signature: 'reverse list',
        text: 'The same elements in the opposite order.',
        examples: [{ code: 'reverse [1, 2, 3]', result: '[3, 2, 1]' }],
      },
      {
        title: 'zip',
        signature: 'zip left right',
        text: 'Pairs up elements by position. The result is as long as the shorter list.',
        examples: [
          { code: 'zip [1, 2, 3] [10, 20]', result: '[(1, 10), (2, 20)]' },
          { code: 'map (\\p -> fst p * snd p) (zip [1, 2, 3] [4, 5, 6])', result: '[4, 10, 18]' },
        ],
      },
      {
        title: 'range',
        signature: 'range from to',
        text: 'Whole numbers from `from` to `to`, both included. If `to` is smaller than `from`, the result is empty. Both must be integers, and a range can hold at most 1000 elements.',
        examples: [
          { code: 'range 1 5', result: '[1, 2, 3, 4, 5]' },
          { code: 'range 5 1', result: '[]' },
        ],
      },
      {
        title: 'fst and snd',
        signature: 'fst pair   snd pair',
        text: 'The first or second component of a pair.',
        examples: [{ code: 'map fst (zip [1, 2] [3, 4])', result: '[1, 2]' }],
      },
    ],
  },
  {
    id: 'recipes',
    title: 'Recipes',
    entries: [
      {
        title: 'Sum, product and maximum',
        text: 'Most list summaries are one `fold`.',
        examples: [
          { code: 'let xs = [4, 8, 15, 16]\nin [fold (+) 0 xs, fold (*) 1 xs, fold (\\m x -> if x > m then x else m) 0 xs]', result: '[43, 7680, 16]' },
        ],
      },
      {
        title: 'Dot product',
        text: '`zip` two lists, multiply each pair, then add up.',
        examples: [{ code: 'let a = [1, 2, 3]\n    b = [4, 5, 6]\nin fold (\\acc p -> acc + fst p * snd p) 0 (zip a b)', result: '32' }],
      },
      {
        title: 'Count matches',
        text: 'Filter, then fold a counter.',
        examples: [{ code: 'let scores = [55, 72, 90, 41, 68]\nin fold (\\n x -> n + 1) 0 (filter (\\s -> s >= 60) scores)', result: '3' }],
      },
      {
        title: 'Brighten an image (2D grid)',
        text: 'A nested `map` over a list of rows. The output row is drawn as a pixel grid.',
        examples: [{ code: 'let image = [[10, 20], [30, 40]]\nin map (\\row -> map (\\px -> px * 2 + 5) row) image', result: '[[25, 45], [65, 85]]' }],
      },
      {
        title: 'Discrete Fourier transform (real part)',
        text: 'With no trigonometry built in, precompute the cosine table and take one dot product per row. This 5-point version uses 173 of the 300 steps.',
        examples: [
          {
            code: 'let xs = [1, 2, 3, 4, 5]\n    cosT = [[1, 1, 1, 1, 1], [1, 0.309, -0.809, -0.809, 0.309], [1, -0.809, 0.309, 0.309, -0.809], [1, -0.809, 0.309, 0.309, -0.809], [1, 0.309, -0.809, -0.809, 0.309]]\nin map (\\row -> fold (\\acc p -> acc + fst p * snd p) 0 (zip row xs)) cosT',
            result: '[15, -2.5, -2.5, -2.5, -2.5]',
          },
        ],
      },
    ],
  },
  {
    id: 'limits',
    title: 'Errors and limits',
    entries: [
      {
        title: 'Syntax errors',
        text: 'Reported as you type. The bad spot gets a wavy underline, its line number turns red and the message shows under the editor.',
        examples: [
          { code: '[1, 2', result: "error: Expected ']' to close the list but found '<end of input>' (line 1, col 6)" },
          { code: 'let map = 1 in map', result: "error: 'map' is a built-in function and cannot be rebound (line 1, col 5)" },
        ],
      },
      {
        title: 'Runtime errors',
        text: 'The program runs up to the failing step, which you can still scrub through. Common ones: division or modulo by zero, an unknown name, the wrong type for an operator, or calling something that is not a function.',
        examples: [
          { code: '1 / 0', result: 'error: Division by zero' },
          { code: '1 + true', result: 'error: (+) needs numbers, got a number and a boolean' },
          { code: '2 3', result: 'error: Cannot apply a number (2) as a function' },
        ],
      },
      {
        title: 'The 300-step limit',
        text: 'Every run stops after 300 small steps so the timeline stays readable. A map or fold costs roughly three steps per element, so keep lists to a few dozen items.',
        examples: [{ code: 'fold (+) 0 (range 1 200)', result: 'error: Stopped after 300 steps (safety limit)' }],
      },
    ],
  },
];
