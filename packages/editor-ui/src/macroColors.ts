import { LIVE_PALETTE } from './livePalette';

/**
 * Live's own 70-colour palette, sampled pixel-by-pixel from a screenshot of
 * its colour picker (`pnpm adg-palette`, see `livePalette.ts`).
 *
 * Grid position IS the number Live stores in `MacroColor.N` and
 * `DocumentColorIndex`, so this array can be indexed directly. Confirmed
 * against `donors/BS.adg` at both ends of the grid: index 13 is white and
 * index 69, the last swatch, is grey, matching what its author picked
 * (SCHEMA.md Q13).
 */
export const MACRO_PALETTE = LIVE_PALETTE;

/** The colour to draw a macro in. Falls back to a neutral for an unknown index, which covers -1, Live's "no colour set" (SCHEMA.md Q13). */
export function macroColor(colorIndex: number): string {
  return MACRO_PALETTE[colorIndex] ?? 'var(--knob-fill-default, #6ea8ff)';
}

/** Every index the picker offers, in Live's own grid order. */
export const PALETTE_INDICES: readonly number[] = MACRO_PALETTE.map((_, i) => i);

/** Live lays the picker out 14 wide; matching that keeps the swatches where a user expects them. */
export const PALETTE_COLUMNS = 14;
