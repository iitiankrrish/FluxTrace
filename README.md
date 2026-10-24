# Flux Trace

### A Functional Programming Time Machine for Tracing, Visualising and Counterfactual Rewriting of Every Value

**FluxTrace runs a small Haskell-like language one reduction at a time. It shows where every value came from, and works backwards from the output you want to the exact source edit that produces it.**

## Table of contents

1. [Project description](#1-project-description)
2. [Key features](#2-key-features)
3. [Video demonstration](#3-visual-preview-and-video-demonstration)
4. [System architecture](#4-system-architecture)
5. [Prerequisites and tech stack](#5-prerequisites-and-tech-stack)
6. [Folder structure](#8-folder-structure)
7. [Usage guide](#9-usage-guide)
8. [The language at a glance](#10-the-language-at-a-glance)
9. [Documentation index](#14-documentation-index)

---

## 1. Project description

### The problem

When a functional program gives a wrong answer, the usual tools fall short:
- **Limited visibility into execution.** Traditional interpreters show only the final result, hiding intermediate states where bugs may occur.
- **No value provenance.** There is no straightforward way to trace a value back to its origins or identify the inputs and operations that produced it.
- **Manual debugging and correction.** Finding the source change needed to produce a desired output requires manually editing the code and repeatedly re-running the program.

### The solution

Lambda Lineage is a browser-based **visual interpreter, lineage tracer and backward solver** for a pure mini-Haskell language.

1. **It evaluates in small steps.** Each step rewrites exactly one sub-expression, in place, and every intermediate program is kept, so you can scrub through time.
2. **Every value carries provenance.** It gets a unique ID and a record of which values produced it, with which rule and formula. Clicking any value draws arrows to all its ancestors and descendants and shows its full biography.
3. **It solves backwards.** Double-click an output, type the value you wanted, and it inverts the computation along the provenance graph. Each candidate fix to a source literal is **applied and re-run to prove it works**, and only then can you apply it with one click.

---

## 2. Key features

### 2.1 Step-by-step Execution and Data Flow
- **Small-step reduction.** Executes one operation at a time, rewrites the expression in place, and records each step, up to 300 steps per run.
- **Execution details.** Shows the current operation and its formula, with compact representations of in-progress `map`, `filter`, and `fold` operations.
- **Visual data flow.** Displays lists as rows of boxes, from inputs to intermediate results and outputs. Scalar values are shown in a separate row.
- **Value states.** Highlights the active value, fades pending or consumed values, and marks elements kept or dropped by `filter`.
- **2D visualisation.** Switches between list rows and a shaded pixel grid for nested lists.

### 2.2 Click-to-trace lineage
- **Interactive tracing.** Click any box or output value to highlight its ancestors with solid blue outlines and arrows, descendants with dashed tan outlines and arrows, and fade all unrelated values.
- **Lineage details.** The Lineage tab displays the selected value's rule, formula, creation step, and dependent source literals, which are also highlighted in the code.
- **Value biography.** Shows ancestors, the selected value, and its descendants chronologically, including each value's location (e.g., `map box #2 @ step 11`).
- **Step navigation.** Click any biography entry to jump directly to the step that created that value.

### 2.3 Counterfactual Backward Solver
- **Backward solving.** Double-click a value, enter the desired output, and select **Solve backwards** to generate candidate source edits.
- **Operation inversion.** Traces backwards through `+`, `-`, `*`, `/`, `%`, `map` inputs or lambda constants, `fold` accumulators, `filter`, `reverse` and `zip` copies, and `range` offsets.
- **Numerical solving.** Uses the **secant method** to solve shared constants, such as multipliers, then snaps them to the simplest decimal that satisfies the target.
- **Verification and ranking.** Re-runs the entire program for every candidate. Failed patches are listed as *rejected* without an Apply button, while changes that move outliers toward neighbouring values are ranked **most plausible**.
- **Applying patches.** **Apply** rewrites the source, re-runs the program, jumps to the final step, and highlights changed values. **Undo last patch** restores the previous code.

### 2.4 Timeline Drawer
- **Timeline controls.** A hidden bottom drawer opens via the arrow handle or `T`, with first, back, play/pause, forward, and last-step controls.
- **Playback and navigation.** Supports speeds from 0.5× to 4×, a scrubber, and a tick bar colour-coded by rule type (`map`, `fold`, `filter`, arithmetic, beta-reduction, `let`, etc.).

### 2.5 Code Editor, Program Management and Language Reference
- **Program management.** Create, close, and rename program tabs by double-clicking. Tabs and code persist in browser storage.
- **Live execution and error reporting.** Re-runs automatically about 0.3 seconds after typing stops. The footer displays the step count or the status (`no program yet`, `syntax error`, or `runtime error`). Errors are highlighted with wavy underlines, red line numbers, and a message bar. New tabs start with `// write your code`, and comment-only programs show an empty state rather than an error.
- **Built-in documentation.** The searchable **Docs** tab provides section filters and 62 examples, each displaying its result. **Try** opens an example in a new tab, ready for step-by-step execution. Every example is tested to keep the documentation consistent with the interpreter.

---

## 3. Video demonstration

[Demonstration Video]


## 4. System architecture

### 4.1 Components

| Layer | File | Responsibility |
|---|---|---|
| Tokenizer and parser | `src/engine/parser.ts` | Tokenizes source, skips comments, and builds an AST using recursive descent and precedence rules. Assigns deterministic IDs and source spans, and records literal roles for patch descriptions. |
| Stepper | `src/engine/stepper.ts` | `Machine` performs leftmost-innermost reduction, preserves IDs during rewrites, advances `map`, `filter`, and `fold` one box at a time, tracks provenance, and records history up to 300 steps. |
| Values and printing | `values.ts`, `pretty.ts` | Identifies values and generates precedence-aware, ID-tagged token trees for expression highlighting. |
| Stages | `src/engine/stages.ts` | Converts snapshots into data-flow rows and preserves completed rows across steps. |
| Lineage | `src/engine/lineage.ts` | Computes ancestors, descendants, chronological biographies, and projected edges to the nearest visible ancestor. |
| Backward solver | `src/engine/backwardSolver.ts` | Inverts operations to find source edits, solves shared literals using the secant method, verifies patches by re-running, and ranks them by plausibility. |
| Colours | `src/engine/colors.ts` | Assigns stable pastel colours to values and shades pixel grids. |
| Documentation | `src/engine/docs.ts` | Provides the in-app language reference and examples. |
| UI | `src/App.tsx`, `src/components/*` | Manages application state, program tabs, editor, Output, data-flow visualisation with SVG arrows, side panels, documentation, and timeline. |

### 4.2 Data model

Every value carries this record (`src/engine/types.ts`):

```ts
interface ProvenanceMeta {
  id: string;            // "node_33", deterministic for a given program structure
  stepCreated: number;   // the step that produced it (0 = written in the source)
  rule: string;          // "Arithmetic (*)", "Map Step #2", "Zip (left #1)", …
  formula: string;       // "30 * 2 = 60"
  parentIds: string[];   // the values it was computed from
  sourceAstId?: string;  // for literals: the AST node in the original source
  operator?: Operator;   // '+', '*', 'copy', 'offset', 'compare', … (how to invert it)
  offset?: number;       // for range elements: position from the start value
}
```

Each step produces a `StepSnapshot`. It holds the full expression, the active and next redex IDs, the rule and formula, the visual stages, and the provenance index up to that step.

---

## 5. Prerequisites and Tech Stack

### Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Node.js | **18 or newer** (tested on 22) | `node -v` |
| npm | 9 or newer (comes with Node) | `npm -v` |
| Browser | Chrome, Edge, Firefox or Safari (latest) | |

### Tech Stack

| Technology | Version | Role | Why it was chosen |
|---|---|---|---|
| **TypeScript** | 5.6 | All code | An interpreter is tree-shaped data. Discriminated unions make every expression kind explicit, and the compiler catches missing cases. |
| **React** | 18.3 | UI | The UI is a pure function of "program + current step + selection", which is React's model. |
| **Vite** | 5.4 | Dev server and build | Instant hot reload and a zero-config static build. Pinned to 5 on purpose, because newer templates default to untested majors. |
| **Tailwind CSS** | 3.4 | Styling | The pastel design tokens live in one config and the styles sit next to the markup. |
| **framer-motion** | 11 | Animation | Layout animations make in-place rewrites and the drawer slide smooth. |
| **lucide-react** | 0.460 | Icons | Small, consistent icon set. |
| **Vitest** | 2.1 | Tests | Shares Vite's config and TypeScript support, with no extra setup. |

**Hand-written parser.** We need exact source positions for every literal to report "line 1, col 25" and rewrite that exact text, and the grammar is small.

---

### All scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload at `http://localhost:5173` |
| `npm test` | Runs the 52 Vitest tests once (a few seconds) |
| `npm run build` | Type-check and production build into `dist/` |

### Troubleshooting

| Symptom | Fix |
|---|---|
| `npm install` fails with engine errors | Upgrade Node to 18+ (`node -v`) |
| Port 5173 already in use | `npm run dev -- --port 5180` |
| Red underline on `import './index.css'` in your editor | Make sure `src/vite-env.d.ts` exists (it ships with the repo), then restart the TypeScript server (VS Code: *TypeScript: Restart TS Server*) |
| The app opens with old tabs | Tabs are saved in your browser. Close them, or open a private window for a clean start |
| Blank page after deploying to a sub-path | Already handled by `base: './'` in `vite.config.ts`. Make sure you deployed the `dist/` folder |

---

## 6. Folder structure

```
lambda-lineage/
├── index.html                  App shell (title, meta, root element)
├── package.json                Scripts and dependencies
├── package-lock.json           Exact dependency versions
├── vite.config.ts              Vite + React plugin, relative base path, Vitest settings
├── tailwind.config.js          Pastel palette, fonts, shadows
├── postcss.config.js           Tailwind + Autoprefixer
├── tsconfig.json               TypeScript project references
├── tsconfig.app.json           Compiler options for src/
├── tsconfig.node.json          Compiler options for vite.config.ts
├── public/
│   └── favicon.svg
├── docs/
│   ├── LANGUAGE.md             Full language reference (every example is tested)
│   ├── HANDBOOK.md             Onboarding, demo script, judge Q&A, checklist
│   ├── UI-GUIDE.md             Every panel, control and shortcut
│   ├── VIDEO-SCRIPT.md         Timed narration for the demo video
│   └── screenshots/            Real screenshots used in this README
└── src/
    ├── main.tsx                React entry point
    ├── App.tsx                 State, program tabs, layout, keyboard shortcuts, solver wiring
    ├── index.css               Tailwind layers, editor and token styles
    ├── vite-env.d.ts           Vite type declarations (CSS imports, ?raw)
    ├── components/
    │   ├── CodeEditor.tsx      Program tabs, highlighted editor, error marks, status footer
    │   ├── ExpressionView.tsx  Output panel: the program at the current step
    │   ├── Stage.tsx           Data flow rows, boxes, pixel grid, SVG lineage arrows
    │   ├── SidePanels.tsx      Lineage tab and Counterfactual tab
    │   ├── DocsPanel.tsx       Docs tab: search, sections, Try buttons
    │   └── Timeline.tsx        Bottom timeline drawer
    └── engine/
        ├── types.ts            AST, provenance, snapshot, stage and patch types
        ├── parser.ts           Tokenizer, parser, literal roles
        ├── stepper.ts          Small-step reducer, provenance graph, run()
        ├── values.ts           Value predicate
        ├── pretty.ts           ID-tagged pretty printer, number formatting
        ├── stages.ts           Rows of boxes per step, stitched across time
        ├── lineage.ts          Ancestors, descendants, biography, projected edges
        ├── backwardSolver.ts   Inversion, secant refinement, verification, ranking
        ├── colors.ts           Value colours and pixel shading
        ├── docs.ts             Content of the Docs tab
        ├── examples.ts         Example programs used by the tests
        └── __tests__/
            └── interpreter.test.ts   52 tests
```

---

## 7. Usage guide

### 7.1 Layout

- **Left: workspace tabs.**
  - **Code:** your programs.
  - **Lineage:** where a value came from.
  - **Counterfactual:** solve backwards.
  - **Docs:** language reference.
- **Right:**
  - **Output:** the whole program at the current step.
  - **Data flow:** rows of boxes and lineage arrows.
- **Bottom:** the **Timeline** drawer, opened with the arrow handle or `T`.

### 7.2 Write and run a program

1. The first tab contains `// write your code`. Replace it with an expression, for example:
   ```haskell
   let xs = [10, 20, 30, 40]
       doubled = map (\x -> x * 2) xs
   in fold (\acc x -> acc + x) 0 doubled
   ```
2. It runs automatically. The footer shows **28 steps** and the Output shows **200**.
3. Use **+** for more tabs. Double-click a tab name to rename it, and use **×** to close it.

### 7.3 Step through time

Click outside the editor first, so keys go to the app rather than the text box.

| Key | Action |
|---|---|
| `←` / `→` | One step back or forward |
| `Home` / `End` | First or last step |
| `Space` | Play / pause (Replay at the end) |
| `T` | Show or hide the timeline drawer |
| `Esc` | Clear the selection |

In the drawer: ⏮ ◀ ▶ ⏭, speed 0.5× to 4×, the scrubber, and clickable ticks (one per step, coloured by rule).

### 7.4 Trace a value's lineage

| Mouse | Result |
|---|---|
| Click a box (or a number in Output) | Select it, draw lineage arrows, open the **Lineage** tab |
| Click it again, or empty space | Clear the selection |
| Click a mini box in the Lineage list | Select that value |
| Click **step N** in the Lineage list | Jump to the step that created it |

Example: with the program above at the last step, click **60** in the map row. Arrows show it came from **30** (line 1) and **2** (line 2), and it fed into **120** and **200**.

### 7.5 Solve backwards

1. **Double-click** a box. For example, using this program:
   ```haskell
   let prices = [100, 200, -50, 300]
       taxed = map (\p -> p * 110 / 100) prices
   in fold (\total p -> total + p) 0 taxed
   ```
   double-click the output **605**.
2. In the **Counterfactual** tab, type **715** and press **Solve backwards**.
3. You get **6 verified patches**. The top one is *Change input list element -50 → 50 (line 1)*, tagged **most plausible**. Others include `100 → 200`, the fold's initial value `0 → 110` and the tax multiplier `110 → 130`. **Show 1 rejected** reveals the divisor patch, which failed verification.
4. **Apply** rewrites the code and the result becomes **715**. **Undo last patch** brings back `-50` and `605`.

### 7.6 2D lists and the pixel grid

Any list of equal-length number rows renders as a pixel grid. The **Grid / Rows** button on the row switches views.

```haskell
let image = [[10, 20, 30], [40, 50, 60], [70, 80, 90]]
in map (\row -> map (\px -> px * 2 + 5) row) image
```
→ `[[25, 45, 65], [85, 105, 125], [145, 165, 185]]`

### 7.7 Learn the language in the app

Open **Docs**, search (for example "zip") or jump to a section, then press **Try** on any example to open it in a new tab.

---

## 8. The language at a glance

The full reference is in [docs/LANGUAGE.md](docs/LANGUAGE.md) and the in-app **Docs** tab.

```haskell
-- A program is ONE expression; its value is the output. Comments: -- or //
let xs = [10, 20, 30]            -- layout-style multi-binding let
    double x = x * 2             -- function shorthand for \x -> x * 2
in fold (\acc x -> acc + x) 0 (map double xs)
```
which gives `120`

| Category | Syntax |
|---|---|
| Literals | `42`  `2.5`  `-7`  `true`  `false`  `[1, 2]`  `[[1, 0], [0, 1]]`  `(1, true)` |
| Arithmetic | `+ - * / %` (`/` is real division; `%` takes the divisor's sign) |
| Comparison and logic | `== != < > <= >=`  `&& \|\|` |
| Cons | `x : xs` |
| Bindings | `let x = e in body`, one binding per line or separated by `;` or `,` |
| Functions | `\x -> e`, `\acc x -> e`, `let f x y = …`, partial application, sections `(+)` |
| Conditionals | `if c then a else b` |
| Built-ins | `map f xs`, `filter p xs`, `fold f start xs` (left fold), `reverse xs`, `zip xs ys`, `range a b` (inclusive), `fst p`, `snd p` |

**Precedence**, tightest first: application, then `* / %`, then `+ -`, then `:`, then comparisons, then `&&`, then `||`.

---

## 9. Documentation index

| Document | For |
|---|---|
| [docs/LANGUAGE.md](docs/LANGUAGE.md) | Writing programs: every construct with tested examples |
| [docs/UI-GUIDE.md](docs/UI-GUIDE.md) | Every panel, control, colour and shortcut |
