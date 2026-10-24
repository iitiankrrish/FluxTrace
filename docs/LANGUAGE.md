# FluxTrace language reference

FluxTrace runs a small, pure, Haskell-flavoured expression language. This page covers all of it. Every example below is checked by the test suite, so the result shown under each one is exactly what the app produces.

You can also read this reference inside the app: open the **Docs** tab in the left panel. Click **Try** on any example there to open it in a new program tab.

## Contents

- [Basics](#basics)
- [Values](#values)
- [Operators](#operators)
- [let … in](#let-in)
- [Functions](#functions)
- [if … then … else](#if-then-else)
- [Built-in functions](#built-in-functions)
- [Recipes](#recipes)
- [Errors and limits](#errors-and-limits)
- [Cheat sheet](#cheat-sheet)

## Basics

A program is one expression. FluxTrace reduces it one small step at a time until only a value is left, and that value is the output.

### A program is an expression

There are no statements, no main and no printing. Write the expression you want evaluated. Line breaks and indentation are free, except inside `let` (see below).

```haskell
1 + 2 * 3
```
→ `7`

```haskell
map (\x -> x * x) [1, 2, 3]
```
→ `[1, 4, 9]`

### Comments

Both `--` and `//` start a comment that runs to the end of the line. A tab with only comments is treated as empty, not as an error.

```haskell
-- Haskell style
// or C style
10 * 4 + 2 -- trailing comments work too
```
→ `42`

### Names

Variable names start with a letter or `_`, and can contain letters, digits, `_` and `'`. Names are case-sensitive. The keywords `let`, `in`, `if`, `then`, `else`, `true` and `false`, and the built-in function names, cannot be used as variable names.

```haskell
let price_2 = 5
    price' = price_2 * 2
in price'
```
→ `10`

## Values

### Numbers

Whole numbers and decimals. A minus sign directly in front of a digit makes a negative literal. There is no scientific notation, and a decimal needs digits on both sides of the point (`0.5`, not `.5`). Results are rounded to 12 significant digits, so `0.1 + 0.2` is exactly `0.3`. The output view shows at most 6 decimals.

```haskell
[42, 3.75, -7, 0.5]
```
→ `[42, 3.75, -7, 0.5]`

```haskell
0.1 + 0.2
```
→ `0.3`

### Booleans

`true` and `false`, in lowercase. Comparisons produce them, and `if` and `filter` need them.

```haskell
[true, false, 3 > 2]
```
→ `[true, false, true]`

### Lists

Square brackets with comma-separated items. Lists can be empty, nested (a list of rows shows up as a 2D pixel grid) and can hold any value, including booleans and pairs.

```haskell
[]
```
→ `[]`

```haskell
[[1, 2, 3], [4, 5, 6]]
```
→ `[[1, 2, 3], [4, 5, 6]]`

### Pairs and tuples

Round brackets with commas. `zip` produces pairs, and `fst` and `snd` read the first and second component.

```haskell
(1, true)
```
→ `(1, true)`

```haskell
snd (3, 4)
```
→ `4`

### Not supported

There are no strings, characters, records or user-defined types. `True` with a capital T is just an unknown name.

```haskell
True
```
→ `error: Unbound variable 'True'`

## Operators

All operators are infix. The precedence table below goes from tightest to loosest; use parentheses whenever in doubt.

| Operators (tightest first) | Associativity | Meaning |
|---|---|---|
| `f x y` | left | function application binds tightest |
| `* / %` | left | multiply, divide, modulo |
| `+ -` | left | add, subtract |
| `:` | right | cons onto a list |
| `== != < > <= >=` | left | comparison |
| `&&` | left | and |
| `\|\|` | left | or (loosest) |

### Arithmetic

`+   -   *   /   %`

`/` is real division (`7 / 2` is `3.5`). `%` is a modulo whose result has the sign of the divisor, as in Haskell's `mod`, so `-7 % 3` is `2`. Dividing by zero is a runtime error.

```haskell
[7 / 2, 7 % 3, -7 % 3]
```
→ `[3.5, 1, 2]`

```haskell
2 + 3 * 4
```
→ `14`

```haskell
(2 + 3) * 4
```
→ `20`

```haskell
10 - 3 - 2
```
→ `5`

### Negation

A minus in front of an expression negates it. When passing a negative number to a function, wrap it in parentheses: `f -3` means `f` minus `3`.

```haskell
let x = 4 in -x
```
→ `-4`

```haskell
let half x = x / 2 in half (-3)
```
→ `-1.5`

### Comparison

`==   !=   <   >   <=   >=`

`<` `>` `<=` `>=` compare numbers. `==` and `!=` compare any two values, including whole lists and pairs.

```haskell
[3 < 5, 3 >= 5, 2 != 2]
```
→ `[true, false, false]`

```haskell
[1, 2] == [1, 2]
```
→ `true`

### Logic

`&&   ||`

Both sides must be booleans. `&&` binds tighter than `||`. There is no `not`; write `x == false` instead.

```haskell
true && false || true
```
→ `true`

### Cons

`x : list`

Puts a value in front of a list. It is right-associative and looser than arithmetic, so `1 + 1 : [5]` means `(1 + 1) : [5]`.

```haskell
1 : 2 : [3]
```
→ `[1, 2, 3]`

```haskell
1 + 1 : [5]
```
→ `[2, 5]`

### Operator sections

`(+)   (*)   (:)   (==)   …`

Any operator in parentheses becomes a two-argument function, which is handy with `fold`.

```haskell
fold (+) 0 [1, 2, 3, 4]
```
→ `10`

```haskell
(-) 10 4
```
→ `6`

## let … in

### Bindings

`let name = value in body`

Gives a name to a value inside the body. A later binding can use the earlier ones.

```haskell
let x = 5 in x * x + 1
```
→ `26`

### Several bindings

Put each binding on its own line, or separate them with `;` or `,` on one line. A new binding must start on a fresh line (or right after `;` or `,`), which is how FluxTrace tells it apart from a function call.

```haskell
let base = 3
    bonus = base * 10
    nums = [1, 2]
in map (\n -> n + bonus) nums
```
→ `[31, 32]`

```haskell
let a = 2; b = 5 in a * b
```
→ `10`

### Function shorthand

`let f x y = body`

Parameters after the name are shorthand for a lambda: `let f x = e` is the same as `let f = \x -> e`.

```haskell
let add x y = x + y in add 2 3
```
→ `5`

### No recursion

A binding cannot refer to itself, so recursive functions are not possible. Use `map`, `filter`, `fold` and `range` for repetition. An inner `let` can shadow an outer name.

```haskell
let x = 1 in let x = x + 10 in x
```
→ `11`

```haskell
let f n = if n == 0 then 0 else f (n - 1) in f 3
```
→ `error: Unbound variable 'f'`

## Functions

### Lambdas

`\x -> body   \a b -> body`

A backslash, one or more parameter names, an arrow and a body. The body reaches as far right as possible, so wrap a lambda in parentheses when something follows it.

```haskell
(\x -> x * x) 5
```
→ `25`

```haskell
(\a b -> a - b) 10 4
```
→ `6`

### Application

`f x y`

Call a function by writing its arguments after it, separated by spaces, with no parentheses or commas. Wrap any argument that is not a single name, number or bracketed value in parentheses.

```haskell
let area w h = w * h in area 3 (2 + 2)
```
→ `12`

### Partial application

Give a function fewer arguments than it takes and you get a function waiting for the rest. This works for lambdas, operator sections and built-ins.

```haskell
let add = \a b -> a + b
    inc = add 1
in inc 41
```
→ `42`

```haskell
let double = map (\x -> x * 2) in double [1, 2, 3]
```
→ `[2, 4, 6]`

## if … then … else

### Conditionals

`if cond then a else b`

The condition must be a boolean, and `else` is required. Only the chosen branch is evaluated, and in the data flow the result keeps the condition as one of its parents.

```haskell
if 2 > 1 then 10 else 20
```
→ `10`

```haskell
map (\x -> if x > 2 then x else 0) [1, 2, 3, 4]
```
→ `[0, 0, 3, 4]`

```haskell
if 1 then 2 else 3
```
→ `error: if-condition must be a boolean, got a number`

## Built-in functions

Eight built-ins cover all repetition. Their names are reserved.

### map

`map f list`

Applies `f` to every element and returns the new list. Each box lights up in place as it is computed.

```haskell
map (\x -> x + 1) [1, 2, 3]
```
→ `[2, 3, 4]`

```haskell
map (\row -> map (\x -> x * 10) row) [[1, 2], [3, 4]]
```
→ `[[10, 20], [30, 40]]`

### filter

`filter pred list`

Keeps the elements for which `pred` returns `true`. `pred` must return a boolean.

```haskell
filter (\x -> x % 2 == 0) (range 1 10)
```
→ `[2, 4, 6, 8, 10]`

### fold

`fold f start list`

A left fold: starting from the accumulator `start`, it calls `f acc x` for each element from left to right, and returns the final accumulator. The function takes the accumulator first.

```haskell
fold (\acc x -> acc + x) 0 [1, 2, 3, 4]
```
→ `10`

```haskell
fold (\best x -> if x > best then x else best) 0 [3, 9, 2]
```
→ `9`

```haskell
fold (\acc x -> x : acc) [] [1, 2, 3]
```
→ `[3, 2, 1]`

### reverse

`reverse list`

The same elements in the opposite order.

```haskell
reverse [1, 2, 3]
```
→ `[3, 2, 1]`

### zip

`zip left right`

Pairs up elements by position. The result is as long as the shorter list.

```haskell
zip [1, 2, 3] [10, 20]
```
→ `[(1, 10), (2, 20)]`

```haskell
map (\p -> fst p * snd p) (zip [1, 2, 3] [4, 5, 6])
```
→ `[4, 10, 18]`

### range

`range from to`

Whole numbers from `from` to `to`, both included. If `to` is smaller than `from`, the result is empty. Both must be integers, and a range can hold at most 1000 elements.

```haskell
range 1 5
```
→ `[1, 2, 3, 4, 5]`

```haskell
range 5 1
```
→ `[]`

### fst and snd

`fst pair   snd pair`

The first or second component of a pair.

```haskell
map fst (zip [1, 2] [3, 4])
```
→ `[1, 2]`

## Recipes

### Sum, product and maximum

Most list summaries are one `fold`.

```haskell
let xs = [4, 8, 15, 16]
in [fold (+) 0 xs, fold (*) 1 xs, fold (\m x -> if x > m then x else m) 0 xs]
```
→ `[43, 7680, 16]`

### Dot product

`zip` two lists, multiply each pair, then add up.

```haskell
let a = [1, 2, 3]
    b = [4, 5, 6]
in fold (\acc p -> acc + fst p * snd p) 0 (zip a b)
```
→ `32`

### Count matches

Filter, then fold a counter.

```haskell
let scores = [55, 72, 90, 41, 68]
in fold (\n x -> n + 1) 0 (filter (\s -> s >= 60) scores)
```
→ `3`

### Brighten an image (2D grid)

A nested `map` over a list of rows. The output row is drawn as a pixel grid.

```haskell
let image = [[10, 20], [30, 40]]
in map (\row -> map (\px -> px * 2 + 5) row) image
```
→ `[[25, 45], [65, 85]]`

### Discrete Fourier transform (real part)

With no trigonometry built in, precompute the cosine table and take one dot product per row. This 5-point version uses 173 of the 300 steps.

```haskell
let xs = [1, 2, 3, 4, 5]
    cosT = [[1, 1, 1, 1, 1], [1, 0.309, -0.809, -0.809, 0.309], [1, -0.809, 0.309, 0.309, -0.809], [1, -0.809, 0.309, 0.309, -0.809], [1, 0.309, -0.809, -0.809, 0.309]]
in map (\row -> fold (\acc p -> acc + fst p * snd p) 0 (zip row xs)) cosT
```
→ `[15, -2.5, -2.5, -2.5, -2.5]`

## Errors and limits

### Syntax errors

Reported as you type. The bad spot gets a wavy underline, its line number turns red and the message shows under the editor.

```haskell
[1, 2
```
→ `error: Expected ']' to close the list but found '<end of input>' (line 1, col 6)`

```haskell
let map = 1 in map
```
→ `error: 'map' is a built-in function and cannot be rebound (line 1, col 5)`

### Runtime errors

The program runs up to the failing step, which you can still scrub through. Common ones: division or modulo by zero, an unknown name, the wrong type for an operator, or calling something that is not a function.

```haskell
1 / 0
```
→ `error: Division by zero`

```haskell
1 + true
```
→ `error: (+) needs numbers, got a number and a boolean`

```haskell
2 3
```
→ `error: Cannot apply a number (2) as a function`

### The 300-step limit

Every run stops after 300 small steps so the timeline stays readable. A map or fold costs roughly three steps per element, so keep lists to a few dozen items.

```haskell
fold (+) 0 (range 1 200)
```
→ `error: Stopped after 300 steps (safety limit)`

## Cheat sheet

```haskell
-- comments: -- or //
42   3.75   -7   true   false   [1, 2, 3]   [[1, 2], [3, 4]]   (1, true)
+ - * / %   == != < > <= >=   && ||   x : xs   (+) (*) (:)
let x = 1
    f a b = a + b
in f x 2
\x -> x * 2        \acc x -> acc + x
if c then a else b
map f xs   filter p xs   fold f start xs   reverse xs
zip xs ys   range lo hi   fst p   snd p
```

Limits: 300 steps per run, ranges of up to 1000 elements, no recursion, no strings.
