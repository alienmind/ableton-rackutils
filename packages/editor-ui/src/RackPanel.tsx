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
 * One rack, drawn as a rack: its name, its macro bank, and its chains - and
 * every rack inside it drawn the same way, recursively (UI-PLAN Part 2.6 rule
 * 1). The root rack is not a special case, it is the outermost call.
 *
 * `rack` is a live handle derived during the parent's render, so it is never
 * stale. Anything that has to survive a mutation travels as a `RackPath`
 * instead (see `context.tsx`).
 */
export function RackPanel({ rack, rackPath, depth, collapsible }: RackPanelProps) {
  // The first level of nesting opens by default; deeper levels start
  // collapsed. A rack's contents are the point of this UI - hiding a drum
  // rack's pads behind a click when the whole rack IS that drum rack makes the
  // page look empty. The guard still holds where it matters: a drum rack with
  // a rack on every pad stops expanding at the pads rather than opening every
  // engine inside them (UI-PLAN Part 2.6).
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

      {open && (
        <div className="rack-body">
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

          {isDrumRack && pads.length > 0 ? (
            <DrumPadGrid pads={pads} rackPath={rackPath} renderChainBody={chainBody} />
          ) : (
            <div className="chain-list">
              {rack.chains.map((chain) => (
                <section className="chain-panel" key={chain.path}>
                  <h4 className="chain-name">{chain.name || 'Chain'}</h4>
                  {chainBody(chain)}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A rack inside a rack: resolve it as a sub-rack view and render the same panel one level down. */
function NestedRack({ parent, device, rackPath, depth }: { parent: Rack; device: DeviceNode; rackPath: RackPath; depth: number }) {
  const nested = parent.subRack(device.path);
  if (!nested) return <DeviceRow device={device} rackPath={rackPath} />;
  return <RackPanel rack={nested} rackPath={[...rackPath, device.path]} depth={depth + 1} collapsible />;
}
