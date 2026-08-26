/**
 * Polar-to-cartesian SVG arc, the shape Ableton draws a macro value with: a
 * filled portion of a ring rather than a rotated pointer line.
 *
 * -135..+135 degrees, 270 degrees of sweep, matching `doc/DEVELOPERS.md`'s
 * convention and trackster's `useKnobInteraction`, so a drag-to-set-value hook
 * lifted from there later lines up without conversion.
 */
export const KNOB_MIN_DEG = -135;
export const KNOB_MAX_DEG = 135;

/** Macro value (0..127) to a degree on the knob's sweep. */
export function valueToDegrees(value: number): number {
  const clamped = Math.min(Math.max(value, 0), 127);
  return (clamped / 127) * (KNOB_MAX_DEG - KNOB_MIN_DEG) + KNOB_MIN_DEG;
}

export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const point = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };
  // An arc of zero length has no valid path; SVG would drop it silently and
  // leave the previous frame's stroke behind in some renderers.
  const sweep = endDeg - startDeg;
  if (Math.abs(sweep) < 0.01) return '';
  const [sx, sy] = point(startDeg);
  const [ex, ey] = point(endDeg);
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}
