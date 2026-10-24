// The 5 curated hackathon demo programs.

export interface Preset {
  id: string;
  title: string;
  /** Which language features / stage visuals this example exercises (shown as a tooltip). */
  shows: string;
  code: string;
  /** Preferred stage view. */
  view?: '1d' | '2d';
}

export const PRESETS: Preset[] = [
  {
    id: 'map-fold',
    title: '1. Classic Map & Fold Pipeline',
    shows: 'map + fold, accumulator box',
    code: `-- 1. Classic Map & Fold Pipeline
let xs = [10, 20, 30, 40]
    doubled = map (\\x -> x * 2) xs
in fold (\\acc x -> acc + x) 0 doubled`,
  },
  {
    id: 'transpose',
    title: '2. Melody Transposer',
    shows: 'let-bound constant, if inside fold (max)',
    code: `-- 2. Melody Transposer
-- C major arpeggio, transposed up a perfect fifth (7 semitones)
let melody = [60, 64, 67, 72]
    fifth = 7
    harmony = map (\\note -> note + fifth) melody
in fold (\\top note -> if note > top then note else top) 0 harmony`,
  },
  {
    id: 'bug-hunter',
    title: '3. Bug Hunter',
    shows: 'division, one bad input to fix with the solver',
    code: `-- 3. Bug Hunter: one corrupted price breaks the invoice
-- Expected total with 10% tax: 715
let prices = [100, 200, -50, 300]
    taxed = map (\\p -> p * 110 / 100) prices
in fold (\\total p -> total + p) 0 taxed`,
  },
  {
    id: 'filter-zip',
    title: '4. Filter, Reverse & Zip',
    shows: 'filter keep/drop, reverse, zip pairs, fst/snd',
    code: `-- 4. Filter, Reverse & Zip Pipeline
let readings = [12, 18, 7, 25, 30, 9]
    big = filter (\\x -> x > 15) readings
    flipped = reverse big
    pairs = zip big flipped
in map (\\p -> fst p + snd p) pairs`,
  },
  {
    id: 'grid',
    title: '5. 2D Pixel Grid',
    shows: 'nested map over a 2D list, pixel-grid view',
    view: '2d',
    code: `-- 5. 2D Pixel Grid Shader
let image = [[10, 20, 30], [40, 50, 60], [70, 80, 90]]
    gain = 2
    brighten = \\px -> px * gain + 5
in map (\\row -> map brighten row) image`,
  },
];
