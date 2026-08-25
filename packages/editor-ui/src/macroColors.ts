import { LIVE_PALETTE } from './livePalette';

/**
 * Live's own 70-colour palette, sampled pixel-by-pixel from a screenshot of
 * its colour picker (`pnpm adg-palette`, see `livePalette.ts`). This replaces
 * the 16 invented stand-ins that stood here while the reference image was on
 * hold - a knob now shows a colour Live actually offers.
 *
 * ONE THING IS STILL UNCONFIRMED, and it is the important one: whether a
 * swatch's position in that grid is the number Live stores in `MacroColor.N`
 * and `DocumentColorIndex`. Grid order and stored index are two different
 * things until a diff says otherwise (SCHEMA.md Q13, doc/PLAN.md Part 5). So
 * these are certainly Live's colours; whether index 7 here is the same colour
 * Live calls 7 needs a rack coloured by hand and diffed.
 *
 * To settle it: colour three or four macros distinctly in Live, save, run
 * `pnpm adg-tool mappings` or read `MacroColor.N` straight out of the XML, and
 * check which index landed where.
 */
export const MACRO_PALETTE = LIVE_PALETTE;

/** The colour to draw a macro in. Falls back to a neutral rather than pretending an unknown index meant colour 0. */
export function macroColor(colorIndex: number): string {
  return MACRO_PALETTE[colorIndex] ?? 'var(--knob-fill-default, #6ea8ff)';
}

/** Every index the picker offers, in Live's own grid order. */
export const PALETTE_INDICES: readonly number[] = MACRO_PALETTE.map((_, i) => i);

/** Live lays the picker out 14 wide; matching that keeps the swatches where a user expects them. */
export const PALETTE_COLUMNS = 14;
