import { useState } from 'react';
import type { DeviceNode, ParamRef } from '@rackutils/adg-codec';
import { samePath, useEditor, type RackPath } from './context';

export interface DeviceRowProps {
  device: DeviceNode;
  rackPath: RackPath;
}

/**
 * A device this tool has no specific rendering for: the fallback floor of
 * UI-PLAN Part 2.6. Mapped parameters are listed immediately, everything else
 * hides behind "more".
 *
 * Mapped vs unmapped is DERIVED on every render, never held in state. That is
 * what makes a parameter jump from "more" up into the mapped list the instant
 * it is bound, with no list surgery anywhere (Part 2.5).
 */
export function DeviceRow({ device, rackPath }: DeviceRowProps) {
  const [showMore, setShowMore] = useState(false);
  const { armed, arm } = useEditor();

  const mapped = device.parameters.filter((p) => p.boundToMacro !== null);
  const unmapped = device.parameters.filter((p) => p.boundToMacro === null);

  const isArmed = (p: ParamRef) => armed !== null && armed.param.path === p.path && samePath(armed.rackPath, rackPath);
  const toggleArm = (p: ParamRef) => arm(isArmed(p) ? null : { rackPath, param: p });

  return (
    <div className="device-row">
      <div className="device-head">
        <span className="device-name">{device.name}</span>
        <span className="device-type">{device.type}</span>
      </div>

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
  );
}
