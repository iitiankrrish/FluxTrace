# FluxTrace UI guide

The screen has two columns and a hidden drawer:

- **Left: workspace tabs** (Code, Lineage, Counterfactual, Docs)
- **Right: Output** (the program being rewritten) above **Data flow** (rows of boxes with lineage arrows)
- **Bottom: timeline drawer**, opened with the small arrow handle or the `T` key

On a phone the columns stack vertically.

---

## Left: workspace tabs

### Code
- **Program tabs** (like files in an editor): each tab holds its own editable program, and any code runs in any tab.
  - **+** opens a new tab.
  - **×** closes a tab (shown on hover, or always on the active tab).
  - **Double-click** a name to rename it.
  - Tabs and their code are saved in your browser.
  - On first load there is one tab, `untitled-1.hs`. Every new tab starts with just `// write your code`; until you write an expression the footer says *no program yet* and the right side shows an empty state instead of an error.
  - Want an example? Copy one from `src/engine/examples.ts` into a tab.
- **Live editing**: the program re-runs about 0.3 s after you stop typing. The footer shows *running…*, *N steps*, *syntax error* or *runtime error*.
- **Errors**: the failing code gets a wavy underline, its line number turns red, and a message bar appears under the editor.
- **Lineage highlight**: while a box is selected, the source literals it depends on get a pale blue background.
- **Patch highlight**: after a patch is applied, the changed literal is briefly shaded green.
- `Tab` inserts two spaces.

### Lineage
This tab opens automatically when you click a box.
- **Header**: the value, the rule that created it, its formula, the step it was created at, and its source line.
- **Depends on N source literals**: click one to select it.
- **Came from / fed into lists**: every ancestor in the order it was created, then the selected value, then its descendants up to the current step. Each entry shows its rule, formula and where it was placed (for example *map box #1 @ step 7*). Click the mini box to select that value, or the **step N** button to jump to the step that created it.

### Counterfactual
This tab opens automatically when you double-click a number.
1. Type the value the number *should be* and press **Solve backwards** (or Enter).
2. Each **verified patch** names the literal to change and its line, and shows what the re-run produces. The top one may be tagged *most plausible* (it moves an outlier back toward its neighbours). **How it was derived** expands the inverse algebra.
3. **Apply** rewrites the source, re-runs, jumps to the final step and briefly marks every box whose value changed.
4. **Undo last patch** restores the previous code. The tab label shows how many patches can be undone.
5. **Show N rejected** lists candidates that failed re-run verification. They have no Apply button.

### Docs
The language reference, inside the app (the same content as [LANGUAGE.md](LANGUAGE.md)).
- **Search** filters entries by name, description or example code.
- **Section chips** (Basics, Values, Operators, …) jump to a section.
- Each example shows its result underneath, green for a value and rose for an error.
- **Try** opens the example in a new program tab (named after the entry, for example `fold-1.hs`) and switches to the Code tab, so you can step through it straight away.

---

## Right: Output

The whole program at the current step, rewritten in place.
- The header shows `step N/M`, the rule that fired and its exact formula.
- **Yellow highlight**: the part the *next* step will rewrite.
- **Green highlight**: the part *just changed* by this step.
- In-progress operations use a compact form: `map f ▸ [done…, current, pending…]`, `filter p ▸ [✓kept, ✗dropped, ?testing, pending]`, and `fold f (acc expression) [remaining]`.
- Click any number to select it. Numbers in the selected value's lineage are underlined.

## Right: Data flow

Each list that has existed so far gets a row, oldest first, so input → map → filter → fold are visible together. A finished row stays on screen, slightly faded. Scalars that are not inside a list (let values, operands, function arguments, `if` conditions) collect on a **values** row, so arithmetic, `let`, lambda and `if` programs get boxes and arrows too.

- **Row header**: kind tag (values / list / map / filter / fold, or *output* for the final result), label (the `let` name or the operation) and the step range. 2D lists have a **Grid / Rows** switch.
- **Boxes**: soft pastel fill per value. Values 12 apart share a colour.
  - **Being reduced**: dark border, raised slightly
  - **Pending**: dashed and faded
  - **Consumed (fold)**: faded, with a small lilac ✓
  - **Kept / dropped (filter)**: green ✓, or rose ✗ with a strikethrough
  - **Still computing**: a yellow pill showing the sub-expression
- **Fold rows** have an **ACC** box updated in place, plus the accumulator expression in progress.
- **Pixel grid**: 2D lists as a matrix shaded from light lavender to slate blue across the grid's own range. The cell being computed has a dark border.

**Mouse**
| Action | Result |
|---|---|
| Click a box | Select it, draw lineage, open the Lineage tab (click again to deselect) |
| Double-click a number | Open the Counterfactual tab for it |
| Click empty space | Clear the selection |

**Lineage drawing**: the selected box gets a dark outline. Ancestors get a blue outline, with solid blue arrows from the boxes they came from. Descendants get a dashed tan outline and dashed tan arrows. Everything else fades. If an intermediate value was never shown as a box, the arrow skips to the nearest visible ancestor.

---

## Bottom: timeline drawer

Hidden by default. Click the **Timeline N/M** handle at the bottom (or press `T`) to slide it up, and again to hide it.

| Control | Key | Effect |
|---|---|---|
| ⏮ / ⏭ | `Home` / `End` | First / last step |
| ◀ / ▶ | `←` / `→` | One step back / forward |
| Play / Pause / Replay | `Space` | Auto-step (Replay restarts from step 0) |
| 0.5× 1× 2× 4× | none | Auto-play speed |
| Scrubber | none | Drag to any step |
| Tick bar | none | One tick per step, coloured by rule kind; click a tick to jump to that step |

The keyboard shortcuts work while the drawer is closed, but not while you are typing in the editor, the example picker or the solver box. `Esc` clears the selection.

---

## Good to know
- Runs stop after **300 steps**.
- Node IDs are deterministic, which is why a selection survives a patch and the solver can verify patches by re-running.
- Lineage is relative to the current step: scrubbing backwards hides descendants that don't exist yet.
