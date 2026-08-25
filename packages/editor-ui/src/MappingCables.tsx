import { useEffect, useState } from 'react';
import type { Rack } from '@rackutils/adg-codec';
import { collectMappings } from './mappings';

/**
 * Every mapping the rack already has, drawn as cables, for as long as Map mode
 * is on (doc/PLAN.md 4.4).
 *
 * Only while it is on. Cables across a rack of racks are a thicket - twenty-six
 * of them on `donors/KD.adg` - and the reason to look at them is that you are
 * about to add one. Turning Map off takes them away again.
 *
 * Endpoints are found in the DOM rather than computed from the model: a
 * parameter is only on screen when its device is expanded, a knob only when
 * its rack shows its macros, and a cable to a control nobody can see is a line
 * from nowhere. Both ends carry `data-map-key`, so a pair that is not currently
 * rendered simply yields no cable.
 *
 * Coordinates are viewport coordinates and the layer is `position: fixed`,
 * exactly as `PatchCable` does it, so nothing has to be converted out of the
 * scrolled row's space. Positions are re-measured on a frame loop while the
 * mode is on: panels expand, the row scrolls sideways, and there is no event
 * that covers all of it.
 */
export interface MappingCablesProps {
  rack: Rack;
  active: boolean;
}

interface Segment {
  key: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}

/** The DOM address of one end of a cable. Rack path and element path together, since a path alone repeats in every rack. */
export function mapKey(rackPath: readonly string[], path: string): string {
  return `${rackPath.join('|')}#${path}`;
}

/** Same, for a macro knob: its rack and its slot. */
export function macroKey(rackPath: readonly string[], index: number): string {
  return `${rackPath.join('|')}#macro${index}`;
}

export function MappingCables({ rack, active }: MappingCablesProps) {
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    if (!active) {
      setSegments([]);
      return;
    }

    const wanted = collectMappings(rack).flatMap((row) =>
      row.targets.map((target) => ({
        key: `${macroKey(row.rackPath, row.macroIndex)}->${mapKey(row.rackPath, target.targetPath)}`,
        knob: macroKey(row.rackPath, row.macroIndex),
        param: mapKey(row.rackPath, target.targetPath),
        color: row.color,
      })),
    );

    let frame = 0;
    let previous = '';
    const measure = () => {
      const next: Segment[] = [];
      for (const cable of wanted) {
        // `~=` because a nested rack's knob carries TWO keys: its own, and
        // the one the rack above addresses it by (SCHEMA.md Q22). Keys hold no
        // whitespace, which is what makes the list form safe.
        const knob = document.querySelector(`[data-map-key~="${cable.knob}"]`);
        const param = document.querySelector(`[data-map-key~="${cable.param}"]`);
        if (!knob || !param) continue;
        next.push({ key: cable.key, from: centreOf(param), to: centreOf(knob), color: cable.color });
      }
      // Re-rendering only when something actually moved: this runs every frame
      // and most frames change nothing.
      const stamp = next.map((s) => `${s.key}${Math.round(s.from.x)},${Math.round(s.from.y)},${Math.round(s.to.x)},${Math.round(s.to.y)}`).join('|');
      if (stamp !== previous) {
        previous = stamp;
        setSegments(next);
      }
      frame = requestAnimationFrame(measure);
    };

    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [rack, active]);

  if (!active || segments.length === 0) return null;

  return (
    <svg className="mapping-cable-layer" aria-hidden="true">
      {segments.map((s) => (
        <g key={s.key}>
          <path className="mapping-cable" style={{ stroke: s.color }} d={cablePath(s.from, s.to)} />
          <circle className="mapping-plug" style={{ fill: s.color }} cx={s.from.x} cy={s.from.y} r={3} />
          <circle className="mapping-plug" style={{ fill: s.color }} cx={s.to.x} cy={s.to.y} r={3} />
        </g>
      ))}
    </svg>
  );
}

function centreOf(el: Element): { x: number; y: number } {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** A resting cable, sagging by a fixed fraction of its span. No physics: these do not move. */
function cablePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const sag = Math.min(Math.hypot(to.x - from.x, to.y - from.y) * 0.18, 90);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + sag}, ${to.x} ${to.y + sag}, ${to.x} ${to.y}`;
}
