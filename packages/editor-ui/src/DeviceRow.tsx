import { useEffect, useState } from 'react';
import type { DeviceNode, ParamRef } from '@rackutils/adg-codec';
import { samePath, useEditor, type RackPath } from './context';

export interface DeviceRowProps {
  device: DeviceNode;
  rackPath: RackPath;
  /** The rack's collapse-devices toggle. Sets this device's state without owning it, so it can still be opened on its own afterwards. */
  collapsed?: boolean;
}

/**
 * A device this tool has no specific rendering for: the fallback floor of
 * UI-PLAN Part 2.6, drawn as one panel in the horizontal device chain.
 *
 * Collapsing turns it into a vertical title strip, which is what Live does
 * with a collapsed device rather than shrinking it or hiding it.
 *
 * Mapped vs unmapped is DERIVED on every render, never held in state. That is
 * what makes a parameter jump from "more" up into the mapped list the instant
 * it is bound, with no list surgery anywhere (Part 2.5).
 */
export function DeviceRow({ device, rackPath, collapsed: collapsedFromRack }: DeviceRowProps) {
  const [collapsed, setCollapsed] = useState(Boolean(collapsedFromRack));
  useEffect(() => setCollapsed(Boolean(collapsedFromRack)), [collapsedFromRack]);
  const [showMore, setShowMore] = useState(false);
  const { armed, arm } = useEditor();

  const mapped = device.parameters.filter((p) => p.boundToMacro !== null);
  const unmapped = device.parameters.filter((p) => p.boundToMacro === null);

  const isArmed = (p: ParamRef) => armed !== null && armed.param.path === p.path && samePath(armed.rackPath, rackPath);
  const toggleArm = (p: ParamRef) => arm(isArmed(p) ? null : { rackPath, param: p });

  if (collapsed) {
    return (
      <div className="device-panel collapsed" title={device.name}>
        <button type="button" className="device-title-strip" onClick={() => setCollapsed(false)}>
          {device.name}
        </button>
      </div>
    );
  }

  return (
    <div className="device-panel">
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
              <li key={p.path}>
                <button type="button" className={isArmed(p) ? 'param armed' : 'param'} onClick={() => toggleArm(p)}>
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
                    <button type="button" className={isArmed(p) ? 'param armed' : 'param'} onClick={() => toggleArm(p)}>
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
