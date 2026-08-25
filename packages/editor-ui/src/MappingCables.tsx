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
 * scrolled row's space. Positions are re-measured when something moves them -
 * a panel opening, the row scrolling, the window resizing - rather than on a
 * frame loop, which would re-measure every control sixty times a second for a
 * picture that changes when a user clicks something.
 */
export interface MappingCablesProps {
  rack: Rack;
  active: boolean;
}

/** The box the cables are allowed to be seen in: the rack's own scrolling row. */
interface Clip {
  top: number;
  right: number;
  bottom: number;
  left: number;
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
  const [clip, setClip] = useState<Clip | null>(null);

  useEffect(() => {
    if (!active) {
      setSegments([]);
      setClip(null);
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
      frame = 0;
      // Cables belong to the rack row and are clipped to it. The layer is
      // fixed over the whole viewport, so a cable to a control scrolled out of
      // the row was drawn across the page beside it - a line coming out of
      // nowhere, over the guide and the mapping table.
      const box = document.querySelector('.rack-editor-scroll')?.getBoundingClientRect();
      const clipped: Clip | null = box ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left } : null;

      const next: Segment[] = [];
      for (const cable of wanted) {
        // `~=` because a nested rack's knob carries TWO keys: its own, and
        // the one the rack above addresses it by (SCHEMA.md Q22). Keys hold no
        // whitespace, which is what makes the list form safe.
        const knob = document.querySelector(`[data-map-key~="${cable.knob}"]`);
        const param = document.querySelector(`[data-map-key~="${cable.param}"]`);
        if (!knob || !param) continue;
        const from = centreOf(param);
        const to = centreOf(knob);
        // Both ends outside the row means the cable has nothing to say: it
        // would be a curve across the page between two things nobody can see.
        if (clipped && !inside(from, clipped) && !inside(to, clipped)) continue;
        next.push({ key: cable.key, from, to, color: cable.color });
      }
      // Re-rendering only when something actually moved: this runs every frame
      // and most frames change nothing.
      const stamp = next.map((s) => `${s.key}${Math.round(s.from.x)},${Math.round(s.from.y)},${Math.round(s.to.x)},${Math.round(s.to.y)}`).join('|');
      if (stamp !== previous) {
        previous = stamp;
        setSegments(next);
      }
      setClip(clipped);
    };

    // Measure once the panels are laid out, then again whenever anything that
    // moves them happens. Event-driven rather than a frame loop: a loop
    // re-measures every control on every frame for a picture that only changes
    // when a panel opens or the row scrolls.
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener('resize', schedule);
    // Capturing, because the row that scrolls is a div inside the page, and a
    // scroll event on it does not bubble.
    window.addEventListener('scroll', schedule, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      observer.disconnect();
    };
  }, [rack, active]);

  if (!active || segments.length === 0) return null;

  return (
    <svg
      className="mapping-cable-layer"
      aria-hidden="true"
      style={
        clip
          ? {
              clipPath: `inset(${clip.top}px ${window.innerWidth - clip.right}px ${window.innerHeight - clip.bottom}px ${clip.left}px)`,
            }
          : undefined
      }
    >
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

const inside = (p: { x: number; y: number }, clip: Clip) => p.x >= clip.left && p.x <= clip.right && p.y >= clip.top && p.y <= clip.bottom;

function centreOf(el: Element): { x: number; y: number } {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** A resting cable, sagging by a fixed fraction of its span. No physics: these do not move. */
function cablePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const sag = Math.min(Math.hypot(to.x - from.x, to.y - from.y) * 0.18, 90);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + sag}, ${to.x} ${to.y + sag}, ${to.x} ${to.y}`;
}
