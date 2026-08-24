/**
 * PLACEHOLDER PALETTE - not Ableton's.
 *
 * `Macro.color` is `MacroColor.N`, an integer index into Live's own colour
 * palette (SCHEMA.md Q7). The real index -> hex table does not exist in this
 * project yet: extracting it is `doc/UI-PLAN.md` Part 1.3, which is on hold at
 * the project owner's explicit instruction, and it needs its own confirmation
 * pass anyway (grid position in Live's picker and the stored index are not
 * guaranteed to be the same number).
 *
 * So these 16 colours are a stand-in that lets the UI be built and read: they
 * are distinguishable from each other and nothing more. A knob showing one of
 * them is NOT showing the colour Live would show. Replacing this file with the
 * confirmed table should be the only change needed on the UI side.
 */
const PLACEHOLDER_PALETTE: readonly string[] = [
  '#ff6b6b',
  '#ff9f45',
  '#ffd166',
  '#c9e265',
  '#6bd47e',
  '#4ecdc4',
  '#45b7ff',
  '#6ea8ff',
  '#8f7dff',
  '#c07dff',
  '#ff7de3',
  '#ff6ba6',
  '#b98a6b',
  '#9aa0aa',
  '#d6d8de',
  '#5f6470',
];

/** The colour to draw a macro in. Falls back to a neutral for an index this placeholder table does not cover, rather than pretending index 0 was meant. */
export function macroColor(colorIndex: number): string {
  return PLACEHOLDER_PALETTE[colorIndex] ?? 'var(--knob-fill-default, #6ea8ff)';
}

/** Indices this placeholder offers in the picker. The real palette is larger (roughly 60-70 swatches in recent Live versions). */
export const PLACEHOLDER_COLOR_INDICES: readonly number[] = PLACEHOLDER_PALETTE.map((_, i) => i);
