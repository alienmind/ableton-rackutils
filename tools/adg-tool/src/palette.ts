#!/usr/bin/env node
/**
 * Turn a screenshot of Live's colour picker into an exact palette table.
 *
 * Reading ~70 swatches off an image by eye produces values that are close
 * enough to look right and wrong enough to matter - the same "confidently
 * wrong" failure `SCHEMA.md` warns about for element names. This samples the
 * centre pixel of every swatch instead, so the numbers are the ones Live drew.
 *
 *   pnpm adg-palette tmp/ableton-colors.png > packages/editor-ui/src/macroColors.ts
 *   pnpm adg-palette tmp/ableton-colors.png --report   # grid detection only
 *
 * The grid is found from the image rather than assumed, by locating where the
 * colour CHANGES (see `edges`). That copes with a screenshot cropped tightly
 * or loosely, which a hardcoded 14x5 would not - and `--cols=`/`--rows=`
 * override it when a particular screenshot defeats the detection.
 *
 * What this canNOT tell you is which INDEX Live stores for each swatch.
 * Grid position and `MacroColor.N` are two different numbers until a diff says
 * otherwise (SCHEMA.md Q13, doc/PLAN.md Part 5). The output is ordered
 * left-to-right, top-to-bottom and says so.
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

interface Grid {
  columns: number[];
  rows: number[];
}

function readPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

const pixel = (png: PNG, x: number, y: number): [number, number, number] => {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
};

/**
 * Where the colour CHANGES, not where it is dark.
 *
 * The first version of this scored columns by brightness and called the dim
 * ones gridlines - which swallowed every dark swatch in the palette. A pure
 * blue swatch is darker than a grey border. Edges are colour differences, so
 * that is what gets measured: the mean per-channel difference between adjacent
 * columns (then rows), peaked to find the boundaries between swatches.
 */
function edges(png: PNG, axis: 'x' | 'y'): number[] {
  const span = axis === 'x' ? png.width : png.height;
  const across = axis === 'x' ? png.height : png.width;
  const diffs = new Array(span).fill(0);

  for (let i = 1; i < span; i++) {
    let total = 0;
    for (let j = 0; j < across; j++) {
      const a = axis === 'x' ? pixel(png, i, j) : pixel(png, j, i);
      const b = axis === 'x' ? pixel(png, i - 1, j) : pixel(png, j, i - 1);
      total += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
    }
    diffs[i] = total / across;
  }

  const max = Math.max(...diffs);
  if (max === 0) return [];
  const threshold = max * 0.35;

  // Collapse each run of high-difference positions to one boundary: a border
  // is two edges (in and out) and must not count as two cells.
  const boundaries: number[] = [0];
  let run: number[] = [];
  for (let i = 1; i < span; i++) {
    if (diffs[i] >= threshold) run.push(i);
    else if (run.length) {
      boundaries.push(Math.round((run[0] + run[run.length - 1]) / 2));
      run = [];
    }
  }
  if (run.length) boundaries.push(Math.round((run[0] + run[run.length - 1]) / 2));
  boundaries.push(span);

  // Cell centres are the midpoints between boundaries. Drop slivers, which are
  // border runs rather than swatches.
  const centres: number[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const width = boundaries[i] - boundaries[i - 1];
    if (width >= 4) centres.push(Math.round((boundaries[i - 1] + boundaries[i]) / 2));
  }
  return centres;
}

/** Evenly spaced centres for a grid whose size the caller already knows. */
function fixedCentres(span: number, count: number): number[] {
  const step = span / count;
  return Array.from({ length: count }, (_, i) => Math.round(step * (i + 0.5)));
}

function detectGrid(png: PNG, forced: { cols?: number; rows?: number }): Grid {
  return {
    columns: forced.cols ? fixedCentres(png.width, forced.cols) : edges(png, 'x'),
    rows: forced.rows ? fixedCentres(png.height, forced.rows) : edges(png, 'y'),
  };
}

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;

function sample(png: PNG, grid: Grid): string[] {
  const out: string[] = [];
  for (const y of grid.rows) {
    for (const x of grid.columns) out.push(hex(pixel(png, x, y)));
  }
  return out;
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flagValue = (name: string) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : undefined;
};
if (!file) {
  console.error('usage: adg-palette <palette.png> [--report] [--cols=N] [--rows=N]');
  console.error('  --cols/--rows override edge detection when the grid is known but the image is awkward.');
  process.exit(2);
}

const png = readPng(file);
const grid = detectGrid(png, { cols: flagValue('cols'), rows: flagValue('rows') });
const swatches = sample(png, grid);

if (args.includes('--report')) {
  console.error(`${png.width}x${png.height}, ${grid.columns.length} columns x ${grid.rows.length} rows = ${swatches.length} swatches`);
  grid.rows.forEach((y, r) => {
    console.error(
      `row ${r}: ` +
        grid.columns
          .map((x) => hex(pixel(png, x, y)))
          .join(' '),
    );
  });
  process.exit(0);
}

const rowSize = grid.columns.length;
const lines = swatches.map((c, i) => `  '${c}',${i % rowSize === rowSize - 1 ? ` // row ${Math.floor(i / rowSize)}` : ''}`);

process.stdout.write(`/**
 * Live's colour palette, sampled from a screenshot of its own colour picker by
 * \`pnpm adg-palette\` (tools/adg-tool/src/palette.ts). ${grid.columns.length} columns x ${grid.rows.length} rows.
 *
 * These are the exact pixels Live drew, NOT eyeballed approximations.
 *
 * ORDER IS GRID ORDER, left to right then top to bottom - which is NOT
 * confirmed to be the index Live stores in \`MacroColor.N\` or
 * \`DocumentColorIndex\`. Grid position and stored index are two different
 * numbers until a diff proves otherwise (SCHEMA.md Q13, doc/PLAN.md Part 5):
 * colour three or four macros distinctly by hand, save, and check which index
 * lands where before trusting this as a lookup.
 */
export const LIVE_PALETTE: readonly string[] = [
${lines.join('\n')}
];
`);
