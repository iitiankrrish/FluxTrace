export interface Example {
  id: string;
  name: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'basics',
    name: 'basics.hs',
    code: `-- Basics: let, lambdas, if, cons (:) and range
let square = \\x -> x * x
    base = 3
    bonus = if base > 2 then 10 else 0
    nums = base : range 4 6
in map (\\n -> square n + bonus) nums`,
  },
  {
    id: 'map-fold',
    name: 'map-fold.hs',
    code: `-- Classic Map & Fold Pipeline
let xs = [10, 20, 30, 40]
    doubled = map (\\x -> x * 2) xs
in fold (\\acc x -> acc + x) 0 doubled`,
  },
  {
    id: 'transpose',
    name: 'transpose.hs',
    code: `-- Melody Transposer
-- C major arpeggio, transposed up a perfect fifth (7 semitones)
let melody = [60, 64, 67, 72]
    fifth = 7
    harmony = map (\\note -> note + fifth) melody
in fold (\\top note -> if note > top then note else top) 0 harmony`,
  },
  {
    id: 'bug-hunter',
    name: 'bug-hunter.hs',
    code: `-- Bug Hunter: one corrupted price breaks the invoice
-- Expected total with 10% tax: 715
let prices = [100, 200, -50, 300]
    taxed = map (\\p -> p * 110 / 100) prices
in fold (\\total p -> total + p) 0 taxed`,
  },
  {
    id: 'filter-zip',
    name: 'filter-zip.hs',
    code: `-- Filter, Reverse & Zip Pipeline
let readings = [12, 18, 7, 25, 30, 9]
    big = filter (\\x -> x > 15) readings
    flipped = reverse big
    pairs = zip big flipped
in map (\\p -> fst p + snd p) pairs`,
  },
  {
    id: 'grid',
    name: 'pixel-grid.hs',
    code: `-- 2D Pixel Grid Shader
let image = [[10, 20, 30], [40, 50, 60], [70, 80, 90]]
    gain = 2
    brighten = \\px -> px * gain + 5
in map (\\row -> map brighten row) image`,
  },
];
