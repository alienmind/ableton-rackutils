import { useEffect, useRef, useState } from 'react';
import type { Rack } from '@rackutils/adg-codec';
import { collectMappings } from './mappings';

/**
 * Every mapping the rack already has, drawn as cables, for as long as Map mode
 * is on (doc/PLAN.md 4.4).
 *
 * Only while it is on. Cables across a rack of racks are a thicket - forty on
 * `donors/KD.adg` - and the reason to look at them is that you are about to add
 * one. Turning Map off takes them away again.
 *
 * Three things make them read as cables rather than as lines:
 *
 * - **They end at whatever is actually on screen.** A parameter inside a
 *   collapsed device has no box of its own, so the cable ends at that device's
 *   strip instead: it still says "this knob drives something in there". Open
 *   the device and it reaches past it to the parameter. Endpoints are found in
 *   the DOM by `data-map-key`, and the search walks UP the path until it finds
 *   something rendered.
 * - **They follow their ends.** Panels open and close over about a fifth of a
 *   second, and a cable that only re-measures when the DOM changes hangs in the
 *   old place and then jumps to the new one.
 * - **They hang.** Each cable's sag is a damped spring, so moving an end makes
 *   it swing and settle rather than snap - the same physics `PatchCable` uses
 *   for the one being dragged.
 *
 * Coordinates are viewport coordinates and the layer is `position: fixed`, so
 * nothing has to be converted out of the scrolled row's space, and the layer is
 * clipped to that row so a cable to something scrolled away is not drawn across
 * the page.
 */
export interface MappingCablesProps {
  rack: Rack;
  active: boolean;
  /**
   * The cable NOT to draw: the one for a parameter being dragged right now.
   *
   * Its live cable follows the pointer, and drawing the stored one underneath
   * put two lines on one binding for as long as the drag lasted.
   */
  hidden?: string | null;
}

/** The box the cables are allowed to be seen in: the rack's own scrolling row. */
interface Clip {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Point {
  x: number;
  y: number;
}

interface Segment {
  key: string;
  from: Point;
  to: Point;
  sag: number;
  color: string;
}

/** Per-cable physics, kept in a ref rather than in state: it changes every frame. */
interface Spring {
  sag: number;
  velocity: number;
  from: Point;
  to: Point;
}

/** The DOM address of one end of a cable. Rack path and element path together, since a path alone repeats in every rack. */
export function mapKey(rackPath: readonly string[], path: string): string {
  return `${rackPath.join('|')}#${path}`;
}

/** Same, for a macro knob: its rack and its slot. */
export function macroKey(rackPath: readonly string[], index: number): string {
  return `${rackPath.join('|')}#macro${index}`;
}

/** Pixels of sag per pixel of span, and the ceiling on it. A long cable hangs further than a short one. */
const SAG_RATIO = 0.18;
const SAG_MAX = 90;
/** Spring constant and damping. Tuned to swing visibly when a panel opens and settle in about a second. */
const STIFFNESS = 120;
const DAMPING = 9;
/** How much of an end's movement becomes swing, so a cable lags behind its plug. */
const KICK = 6;
/** Below this the spring is at rest. */
const REST = 0.4;
/** Frames to keep animating after the last thing that moved: a panel's transition is about this long. */
const SETTLE_FRAMES = 30;

export function MappingCables({ rack, active, hidden }: MappingCablesProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clip, setClip] = useState<Clip | null>(null);
  const springs = useRef(new Map<string, Spring>());

  useEffect(() => {
    if (!active) {
      setSegments([]);
      setClip(null);
      springs.current.clear();
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
    let last = performance.now();
    let settle = 0;

    const step = (now: number) => {
      frame = 0;
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      const box = document.querySelector('.rack-editor-scroll')?.getBoundingClientRect();
      const clipped: Clip | null = box ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left } : null;

      const next: Segment[] = [];
      const alive = new Set<string>();
      let moving = false;

      for (const cable of wanted) {
        if (hidden && cable.param === hidden) continue;
        const knob = findEnd(cable.knob);
        const param = findEnd(cable.param);
        if (!knob || !param) continue;

        const from = centreOf(param);
        const to = centreOf(knob);
        // Both ends outside the row means the cable has nothing to say: it
        // would be a curve across the page between two things nobody can see.
        if (clipped && !inside(from, clipped) && !inside(to, clipped)) continue;

        alive.add(cable.key);
        const spring = springs.current.get(cable.key) ?? { sag: targetSag(from, to), velocity: 0, from, to };
        // An end that moved drags the cable with it: the further it moved this
        // frame, the harder the swing.
        const moved = Math.hypot(from.x - spring.from.x, from.y - spring.from.y) + Math.hypot(to.x - spring.to.x, to.y - spring.to.y);
        if (moved > 0.5) {
          spring.velocity += moved * KICK;
          moving = true;
        }
        spring.from = from;
        spring.to = to;

        const target = targetSag(from, to);
        const acceleration = STIFFNESS * (target - spring.sag) - DAMPING * spring.velocity;
        spring.velocity += acceleration * dt;
        spring.sag += spring.velocity * dt;
        if (Math.abs(spring.velocity) > REST || Math.abs(spring.sag - target) > REST) moving = true;

        springs.current.set(cable.key, spring);
        next.push({ key: cable.key, from, to, sag: spring.sag, color: cable.color });
      }

      for (const key of springs.current.keys()) if (!alive.has(key)) springs.current.delete(key);

      setSegments(next);
      setClip(clipped);

      // Keep going while anything is still swinging, and for a moment after
      // the last change, so a panel that is still opening is followed rather
      // than sampled once and left behind.
      settle = moving ? SETTLE_FRAMES : settle - 1;
      if (settle > 0) frame = requestAnimationFrame(step);
    };

    const kick = () => {
      settle = SETTLE_FRAMES;
      if (frame === 0) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    };

    kick();
    window.addEventListener('resize', kick);
    // Capturing, because the row that scrolls is a div inside the page, and a
    // scroll event on it does not bubble.
    window.addEventListener('scroll', kick, true);
    // A panel opening is a class change, and the width it animates to arrives
    // over the frames after it - hence the transition events too.
    const observer = new MutationObserver(kick);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('transitionrun', kick, true);
    window.addEventListener('transitionend', kick, true);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('resize', kick);
      window.removeEventListener('scroll', kick, true);
      window.removeEventListener('transitionrun', kick, true);
      window.removeEventListener('transitionend', kick, true);
      observer.disconnect();
    };
  }, [rack, active, hidden]);

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
          <path className="mapping-cable" style={{ stroke: s.color }} d={cablePath(s.from, s.to, s.sag)} />
          <circle className="mapping-plug" style={{ fill: s.color }} cx={s.from.x} cy={s.from.y} r={3} />
          <circle className="mapping-plug" style={{ fill: s.color }} cx={s.to.x} cy={s.to.y} r={3} />
        </g>
      ))}
    </svg>
  );
}

/**
 * The element a cable can end at: the one it names, or the nearest thing on
 * screen that CONTAINS it.
 *
 * A parameter inside a collapsed device is not rendered, and a cable that
 * simply vanished said the mapping was gone. Paths are index chains
 * (`dom.ts`), so a device's path is a prefix of its parameters' - dropping
 * segments from the end walks out to the device, then to the chain, and stops
 * at the first one drawn.
 */
function findEnd(key: string): Element | null {
  const [rackPath, path] = splitKey(key);
  // `~=` because a nested rack's knob carries TWO keys: its own, and the one
  // the rack above addresses it by (SCHEMA.md Q22). Keys hold no whitespace,
  // which is what makes the list form safe.
  for (let at: string | null = path; at !== null; at = parentPath(at)) {
    const found = document.querySelector(`[data-map-key~="${rackPath}#${at}"]`);
    if (found) return found;
  }
  return null;
}

function splitKey(key: string): [string, string] {
  const at = key.indexOf('#');
  return [key.slice(0, at), key.slice(at + 1)];
}

/** `0/3/1` -> `0/3` -> `0` -> null. A macro key (`macro4`) has no parent to walk to. */
function parentPath(path: string): string | null {
  if (path.startsWith('macro')) return null;
  const at = path.lastIndexOf('/');
  return at < 0 ? null : path.slice(0, at);
}

const inside = (p: Point, clip: Clip) => p.x >= clip.left && p.x <= clip.right && p.y >= clip.top && p.y <= clip.bottom;

const targetSag = (from: Point, to: Point) => Math.min(Math.hypot(to.x - from.x, to.y - from.y) * SAG_RATIO, SAG_MAX);

function centreOf(el: Element): Point {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** Both control points hang below their own end, which is the asymmetric droop of a real cable rather than an arc. */
function cablePath(from: Point, to: Point, sag: number): string {
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + sag}, ${to.x} ${to.y + sag}, ${to.x} ${to.y}`;
}
