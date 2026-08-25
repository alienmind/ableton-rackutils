import { useRef, useState } from 'react';
import type { DeviceNode, ParamRef } from '@rackutils/adg-codec';
import { samePath, useEditor, type RackPath } from './context';
import { mapKey } from './MappingCables';
import { useParentToggle } from './useParentToggle';

export interface DeviceRowProps {
  device: DeviceNode;
  rackPath: RackPath;
  /**
   * The colour of each macro in the owning rack, by index. A mapped parameter
   * wears the colour of the macro driving it, which is the only cheap way to
   * see WHICH knob a parameter belongs to - a uniform green says "mapped" and
   * nothing more, and a rack has up to 16 of them.
   */
  macroColors: readonly string[];
  /** The rack's collapse-devices toggle. Sets this device's state without owning it, so it can still be opened on its own afterwards. */
  collapsed?: boolean;
}

/**
 * A device this tool has no specific rendering for: the fallback floor of
 * doc/PLAN.md Part 5, drawn as one panel in the horizontal device chain.
 *
 * Collapsing turns it into a vertical title strip, which is what Live does
 * with a collapsed device rather than shrinking it or hiding it.
 *
 * Mapped vs unmapped is DERIVED on every render, never held in state. That is
 * what makes a parameter jump from "more" up into the mapped list the instant
 * it is bound, with no list surgery anywhere (Part 2.5).
 */
export function DeviceRow({ device, rackPath, macroColors, collapsed: collapsedFromRack }: DeviceRowProps) {
  // Devices start collapsed: a chain of six devices opened flat is a wall of
  // parameter lists, and the mapping table already says what each one
  // contributes. Click a strip to open the one you want. The rack's
  // collapse-all button still drives this, but only when it changes.
  const [collapsed, setCollapsed] = useParentToggle(true, collapsedFromRack);
  const [showMore, setShowMore] = useState(false);
  const { armed, arm, mapping, startParamDrag } = useEditor();
  // Where the pointer went down on a parameter. A press that does not move is
  // a click (arm it); a press that moves is a drag onto a knob (bind it). The
  // two gestures share a starting point, so the click handler has to know
  // which one just happened or every drag would also arm the parameter.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const wasClick = (e: React.MouseEvent) => {
    const from = pressedAt.current;
    return !from || Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4;
  };

  const mapped = device.parameters.filter((p) => p.boundToMacro !== null);
  const unmapped = device.parameters.filter((p) => p.boundToMacro === null);

  const paramClass = (p: ParamRef) => `param${isArmed(p) ? ' armed' : ''}${mapping ? ' mappable' : ''}`;

  const isArmed = (p: ParamRef) => armed !== null && armed.param.path === p.path && samePath(armed.rackPath, rackPath);
  const toggleArm = (p: ParamRef) => arm(isArmed(p) ? null : { rackPath, param: p });
  const mappedColor = (p: ParamRef) =>
    p.boundToMacro === null ? undefined : ({ '--mapped-color': macroColors[p.boundToMacro] } as React.CSSProperties);

  if (collapsed) {
    return (
      <div className="panel device-panel collapsed" title={device.name}>
        <button type="button" className="device-title-strip" onClick={() => setCollapsed(false)}>
          {device.name}
        </button>
      </div>
    );
  }

  return (
    <div className="panel device-panel">
      <header className="device-title">
        <button type="button" className="device-collapse" onClick={() => setCollapsed(true)} title="Collapse">
          -
        </button>
        <span className="device-name">{device.name}</span>
      </header>

      <div className="device-body">
        {mapped.length > 0 && (
          <ul className="params mapped-params">
            {mapped.map((p) => (
              <li key={p.path} style={mappedColor(p)}>
                <button
                  type="button"
                  className={paramClass(p)}
                  data-map-key={mapKey(rackPath, p.path)}
                  onPointerDown={(e) => {
                    pressedAt.current = { x: e.clientX, y: e.clientY };
                    if (mapping) startParamDrag(p, rackPath, e);
                  }}
                  onClick={(e) => mapping && wasClick(e) && toggleArm(p)}
                  title={mapTitle(p.name, mapping)}
                >
                  {p.name}
                </button>
                <span className="macro-badge">M{p.boundToMacro! + 1}</span>
              </li>
            ))}
          </ul>
        )}

        {unmapped.length > 0 && (
          <>
            <button type="button" className="more-toggle" onClick={() => setShowMore((s) => !s)}>
              {showMore ? 'less' : `more (${unmapped.length})`}
            </button>
            {showMore && (
              <ul className="params unmapped-params">
                {unmapped.map((p) => (
                  <li key={p.path}>
                    <button
                      type="button"
                      className={paramClass(p)}
                      data-map-key={mapKey(rackPath, p.path)}
                      onPointerDown={(e) => {
                        pressedAt.current = { x: e.clientX, y: e.clientY };
                        if (mapping) startParamDrag(p, rackPath, e);
                      }}
                      onClick={(e) => mapping && wasClick(e) && toggleArm(p)}
                      title={mapTitle(p.name, mapping)}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {device.parameters.length === 0 && <p className="no-params">no bindable parameters</p>}
      </div>
    </div>
  );
}

/**
 * Binding is modal (`context.tsx`): outside Map mode a parameter is something
 * to read, and saying so beats a control that looks draggable and is not.
 */
function mapTitle(name: string, mapping: boolean): string {
  return mapping ? `${name} - drag onto a macro knob to bind, or click to arm` : `${name} - turn on Map to bind it`;
}
