import { useState } from 'react';
import { bindParameter, renameMacro, renameRack, reorderMacro, setMacroColor, setMacroCount, swapMacros, unbindOne } from '@rackutils/adg-codec';
import type { Chain, DeviceNode, Rack } from '@rackutils/adg-codec';
import { DeviceRow } from './DeviceRow';
import { DrumPadGrid } from './DrumPadGrid';
import { MacroBank } from './MacroBank';
import { RackHeader } from './RackHeader';
import { samePath, useEditor, type RackPath } from './context';

export interface RackPanelProps {
  rack: Rack;
  rackPath: RackPath;
  depth: number;
  /** Nested racks collapse; the root does not. */
  collapsible?: boolean;
}

/**
 * One rack, drawn as a rack: its macro panel on the left, its chains and their
 * devices running left to right beside it - the layout Live itself uses, so a
 * rack looks like the thing the user already knows (UI-PLAN Part 2.6 rule 1,
 * Part 5).
 *
 * The root rack is not a special case, it is the outermost call.
 *
 * `rack` is a live handle derived during the parent's render, so it is never
 * stale. Anything that has to survive a mutation travels as a `RackPath`
 * instead (see `context.tsx`).
 */
export function RackPanel({ rack, rackPath, depth, collapsible }: RackPanelProps) {
  // The first level of nesting opens by default; deeper levels start
  // collapsed, as a vertical title strip, the way Live collapses a device.
  const [open, setOpen] = useState(!collapsible || depth <= 1);
  const { armed, arm, apply, liveValues } = useEditor();

  const isDrumRack = rack.deviceEl.tagName === 'DrumGroupDevice';
  const pads = isDrumRack ? rack.chains.filter((c) => c.receivingNote !== null) : [];

  // Only the root rack gets the live overlay: liveValues are keyed by macro
  // index with no rack identity, and every rack reuses indices 0..15
  // (SCHEMA.md Q2), so applying them at depth would show one rack's knob
  // positions on another's.
  const showLive = depth === 0 ? liveValues : undefined;

  const bindHere = (macroIndex: number) => {
    if (!armed) return;
    // A KeyMidi always belongs to the nearest enclosing rack (SCHEMA.md Q2's
    // owning-rack walk), so a macro can only drive a parameter in its OWN
    // rack. Reaching into a nested rack is done by mapping to that rack's own
    // macro instead, which is what Live does too.
    if (!samePath(armed.rackPath, rackPath)) return;
    apply(rackPath, (r) => bindParameter(r, macroIndex, armed.param));
    arm(null);
  };

  const renderDevice = (device: DeviceNode) =>
    device.isRack ? (
      <NestedRack key={device.path} parent={rack} device={device} rackPath={rackPath} depth={depth} />
    ) : (
      <DeviceRow key={device.path} device={device} rackPath={rackPath} />
    );

  const chainBody = (chain: Chain) => chain.devices.map(renderDevice);

  if (collapsible && !open) {
    return (
      <div className="rack-panel collapsed" title={rack.name}>
        <button type="button" className="device-title-strip rack-strip" onClick={() => setOpen(true)}>
          {rack.name}
        </button>
      </div>
    );
  }

  return (
    <section className={`rack-panel depth-${Math.min(depth, 3)}${isDrumRack ? ' drum-rack' : ''}`}>
      <RackHeader
        name={rack.name}
        macroCount={rack.macroCount}
        kind={isDrumRack ? 'Drum Rack' : rack.deviceEl.tagName.replace('GroupDevice', ' Rack')}
        depth={depth}
        collapsible={collapsible}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onRename={(name) => apply(rackPath, (r) => renameRack(r, name))}
        onSetMacroCount={(count) => apply(rackPath, (r) => setMacroCount(r, count))}
      />

      <div className="rack-body">
        <div className="macro-panel">
          <MacroBank
            macros={rack.macros}
            macroCount={rack.macroCount}
            armed={armed !== null && samePath(armed.rackPath, rackPath)}
            liveValues={showLive}
            onReorder={(from, to) => apply(rackPath, (r) => reorderMacro(r, from, to))}
            onSwap={(a, b) => apply(rackPath, (r) => swapMacros(r, a, b))}
            onBindArmed={bindHere}
            onRename={(i, name) => apply(rackPath, (r) => renameMacro(r, i, name))}
            onRecolor={(i, colorIndex) => apply(rackPath, (r) => setMacroColor(r, i, colorIndex))}
            onUnbindOne={(i, targetPath) => apply(rackPath, (r) => unbindOne(r, i, targetPath))}
          />
        </div>

        {isDrumRack && pads.length > 0 ? (
          <DrumPadGrid pads={pads} rackPath={rackPath} renderChainBody={chainBody} />
        ) : (
          <div className="chain-lanes">
            {rack.chains.map((chain) => (
              <div className="chain-lane" key={chain.path}>
                <span className="chain-name">{chain.name || 'Chain'}</span>
                <div className="device-strip">{chainBody(chain)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** A rack inside a rack: resolve it as a sub-rack view and render the same panel one level down. */
function NestedRack({ parent, device, rackPath, depth }: { parent: Rack; device: DeviceNode; rackPath: RackPath; depth: number }) {
  const nested = parent.subRack(device.path);
  if (!nested) return <DeviceRow device={device} rackPath={rackPath} />;
  return <RackPanel rack={nested} rackPath={[...rackPath, device.path]} depth={depth + 1} collapsible />;
}
