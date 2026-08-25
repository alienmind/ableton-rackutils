import { useEffect, useRef, useState } from 'react';
import type { CableEcho, ParamDragState, Point } from './useParamDrag';

/**
 * The patch cable drawn while a parameter is being dragged onto a macro knob.
 *
 * It hangs: the curve sags under its own weight, the sag lags behind the
 * pointer so the cable swings when you move quickly, and on release it either
 * settles onto the knob with a decaying wobble or snaps back to the control it
 * was pulled from.
 *
 * The physics is one number - the sag depth - on a damped spring. That is
 * enough for the whole effect, because a hanging cable IS its sag: the curve
 * is a cubic with both control points pushed straight down by it. Simulating
 * a real rope would be a lot of machinery for a line that lives for a second.
 *
 * Coordinates are viewport coordinates throughout, and the layer is
 * `position: fixed` over the page, so nothing has to be converted out of any
 * scrolled container's space.
 */

/** Pixels of sag per pixel of span, before damping. A cable across the screen hangs further than a short one. */
const SAG_RATIO = 0.28;
const SAG_MAX = 150;
/** Spring constant and damping for the sag. Tuned to swing visibly while dragging and settle in about a second. */
const STIFFNESS = 110;
const DAMPING = 11;
/** How long a connected cable keeps wobbling before it is taken off screen. */
const SETTLE_MS = 1400;
const RETRACT_MS = 260;

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function cablePath(from: Point, to: Point, sag: number): string {
  // Both control points hang below their own end, which gives the asymmetric
  // droop of a real cable rather than a symmetric arc.
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + sag}, ${to.x} ${to.y + sag}, ${to.x} ${to.y}`;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface PatchCableProps {
  drag: ParamDragState;
  echo: CableEcho | null;
  onEchoDone: () => void;
}

export function PatchCable({ drag, echo, onEchoDone }: PatchCableProps) {
  const dragging = drag.origin !== null && drag.pointer !== null;
  const [, forceRender] = useState(0);

  // Live simulation state, kept in refs: this animates every frame and must
  // not queue a React update per frame for values only the path string reads.
  const sag = useRef(0);
  const velocity = useRef(0);
  const retract = useRef(0);
  const startedAt = useRef(0);
  const frame = useRef<number | null>(null);
  const lastEcho = useRef<number | null>(null);

  // A connected cable gets a kick so it visibly bounces on arrival.
  if (echo && lastEcho.current !== echo.id) {
    lastEcho.current = echo.id;
    startedAt.current = performance.now();
    retract.current = 0;
    if (echo.connected) velocity.current += 900;
  }

  const active = dragging || echo !== null;

  useEffect(() => {
    if (!active) {
      sag.current = 0;
      velocity.current = 0;
      return;
    }
    if (prefersReducedMotion()) {
      forceRender((n) => n + 1);
      if (echo) {
        const timer = setTimeout(onEchoDone, 50);
        return () => clearTimeout(timer);
      }
      return;
    }

    let previous = performance.now();
    const step = (now: number) => {
      // Clamped so a backgrounded tab does not resume with one enormous step
      // that flings the spring across the screen.
      const dt = Math.min((now - previous) / 1000, 1 / 30);
      previous = now;

      const from = echo ? echo.from : drag.origin!;
      const to = echo ? echo.to : drag.pointer!;
      const target = Math.min(dist(from, to) * SAG_RATIO, SAG_MAX);

      const acceleration = STIFFNESS * (target - sag.current) - DAMPING * velocity.current;
      velocity.current += acceleration * dt;
      sag.current += velocity.current * dt;

      if (echo) {
        const elapsed = now - startedAt.current;
        if (echo.connected) {
          if (elapsed > SETTLE_MS) {
            onEchoDone();
            return;
          }
        } else {
          // Not connected: the free end runs back to where it was pulled from.
          retract.current = Math.min(elapsed / RETRACT_MS, 1);
          if (retract.current >= 1) {
            onEchoDone();
            return;
          }
        }
      }

      forceRender((n) => n + 1);
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [active, echo, drag.origin, drag.pointer, onEchoDone]);

  if (!active) return null;

  const from = echo ? echo.from : drag.origin!;
  const rawTo = echo ? echo.to : drag.pointer!;
  // While retracting, the loose end travels back along its own path, easing out.
  const t = echo && !echo.connected ? 1 - Math.pow(1 - retract.current, 2) : 0;
  const to = { x: rawTo.x + (from.x - rawTo.x) * t, y: rawTo.y + (from.y - rawTo.y) * t };
  const currentSag = sag.current * (1 - t);

  const connected = echo?.connected ?? false;
  const willConnect = dragging && drag.overMacro !== null && !drag.overForeignRack;
  const refused = dragging && drag.overMacro !== null && drag.overForeignRack;

  // The cable takes the colour of the macro it is over, so a patch reads as
  // belonging to that knob. Refusal keeps its own red: that is a state, not a
  // macro, and it has to say so regardless of what colour the knob is.
  const color = refused ? undefined : (echo?.color ?? (willConnect ? drag.overColor : null)) ?? undefined;

  return (
    <svg className="patch-cable-layer" aria-hidden="true">
      <path
        className={`patch-cable${connected ? ' connected' : ''}${willConnect ? ' will-connect' : ''}${refused ? ' refused' : ''}`}
        style={color ? { stroke: color } : undefined}
        d={cablePath(from, to, currentSag)}
      />
      <circle className="patch-plug" style={color ? { fill: color } : undefined} cx={from.x} cy={from.y} r={3.5} />
      <circle
        className={`patch-plug${connected ? ' connected' : ''}`}
        style={color ? { fill: color } : undefined}
        cx={to.x}
        cy={to.y}
        r={connected ? 5 : 3.5}
      />
    </svg>
  );
}
