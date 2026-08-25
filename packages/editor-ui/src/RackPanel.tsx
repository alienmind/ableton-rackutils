import { useState } from 'react';
import {
  bindParameter,
  renameMacro,
  renameRack,
  reorderMacro,
  setChainColor,
  setMacroColor,
  setMacroCount,
  swapMacros,
} from '@rackutils/adg-codec';
import type { DeviceNode, Rack } from '@rackutils/adg-codec';
import { ChainList } from './ChainList';
import { DeviceRow } from './DeviceRow';
import { RackSideButtons } from './RackSideButtons';
import { macroColor } from './macroColors';
import { VariationsPanel } from './VariationsPanel';
import { MacroBank } from './MacroBank';
import { RackHeader } from './RackHeader';
import { resolveRackPath, samePath, useEditor, type RackPath } from './context';
import { mapKey } from './MappingCables';
import { useParentToggle } from './useParentToggle';

export interface RackPanelProps {
  rack: Rack;
  rackPath: RackPath;
  depth: number;
  /** Nested racks collapse to a vertical title strip; the root does not. */
  collapsible?: boolean;
  /** The parent rack's collapse-devices toggle. Drives this panel's state without taking it over. */
  forceCollapsed?: boolean;
}

/**
 * One rack, laid out as Live lays a rack out and on ONE row: a thin title bar,
 * then macros on the left, the chain list beside them, and the SELECTED
 * chain's devices running off to the right.
 *
 * Selecting one chain at a time is what keeps the row a row. Drawing every
 * chain's devices stacked - the first cut - turned a four-pad drum rack into
 * a page-height wall and buried the devices below the fold.
 *
 * The root rack is not a special case, it is the outermost call: a nested rack
 * is this same component, rendered inline in its parent's device strip.
 */
export function RackPanel({ rack, rackPath, depth, collapsible, forceCollapsed }: RackPanelProps) {
  // Nested racks start COLLAPSED, as vertical title strips. A rack's contents
  // are worth a click; opening every level by default filled the row with
  // panels nobody asked for and pushed the rack you came to look at off the
  // screen. The parent's collapse-all button still drives this when it moves.
  const [collapsedByParent, setCollapsedByParent] = useParentToggle(Boolean(collapsible), forceCollapsed);
  const open = !collapsedByParent;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setCollapsedByParent(!(typeof next === 'function' ? next(open) : next));
  const [selectedChain, setSelectedChain] = useState(0);
  // The six toggles Live puts down the rack's left edge.
  const [showMacros, setShowMacros] = useState(true);
  const [showVariations, setShowVariations] = useState(false);
  const [showChains, setShowChains] = useState(true);
  const [devicesCollapsed, setDevicesCollapsed] = useState(false);
  const { root, mapping, setMapping, armed, arm, apply, liveValues, history, startParamDrag } = useEditor();

  const macroColors = rack.macros.map((m) => macroColor(m.color));
  const isDrumRack = rack.deviceEl.tagName === 'DrumGroupDevice';
  const chains = rack.chains;
  const chain = chains[Math.min(selectedChain, chains.length - 1)];

  // Only the root rack gets the live overlay: liveValues are keyed by macro
  // index with no rack identity, and every rack reuses indices 0..15
  // (SCHEMA.md Q2), so applying them at depth would show one rack's knob
  // positions on another's.
  const showLive = depth === 0 ? liveValues : undefined;

  /**
   * This rack's knobs as mapping sources, addressed from the rack ABOVE it.
   *
   * A macro of a nested rack is a parameter of that rack's device, so the
   * parent's macro drives it through a `KeyMidi` on the child's own
   * `MacroControls.N` (SCHEMA.md Q22). The path therefore has to be taken
   * against the parent, and the root rack has no parent to be mapped from.
   */
  const parentRack = rackPath.length > 0 ? resolveRackPath(root, rackPath.slice(0, -1)) : null;
  const macroElement = (index: number) =>
    Array.from(rack.deviceEl.children).find((c) => c.tagName === `MacroControls.${index}`) ?? null;
  // How the parent addresses each of these knobs, for the cable layer and for
  // nothing else. Null on the root, which no rack maps.
  const parentKeys = parentRack
    ? rack.macros.map((m) => {
        const el = macroElement(m.index);
        return el ? mapKey(rackPath.slice(0, -1), parentRack.pathOf(el)) : null;
      })
    : undefined;
  const dragMacroAsSource = (index: number, e: React.PointerEvent) => {
    if (!parentRack) return;
    const el = macroElement(index);
    if (!el) return;
    const macro = rack.macros[index];
    startParamDrag(
      { path: parentRack.pathOf(el), name: macro.name, boundToMacro: null },
      rackPath.slice(0, -1),
      e,
    );
  };

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
      <NestedRack
        key={device.path}
        parent={rack}
        device={device}
        rackPath={rackPath}
        depth={depth}
        collapsed={devicesCollapsed}
        macroColors={macroColors}
      />
    ) : (
      <DeviceRow key={device.path} device={device} rackPath={rackPath} macroColors={macroColors} collapsed={devicesCollapsed} />
    );

  if (collapsible && !open) {
    return (
      <div className="panel rack-panel collapsed" title={rack.name}>
        <button type="button" className="device-title-strip rack-strip" onClick={() => setOpen(true)}>
          {rack.name}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={`rack-boundary start depth-${Math.min(depth, 3)}`} aria-hidden="true" />
      <section className={`panel rack-panel depth-${Math.min(depth, 3)}${isDrumRack ? ' drum-rack' : ''}`}>
      <RackHeader
        name={rack.name}
        kind={isDrumRack ? 'Drum Rack' : rack.deviceEl.tagName.replace('GroupDevice', ' Rack')}
        depth={depth}
        collapsible={collapsible}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onRename={(name) => apply(rackPath, (r) => renameRack(r, name))}
        history={depth === 0 ? history : undefined}
        mapping={depth === 0 ? { on: mapping, toggle: () => setMapping(!mapping) } : undefined}
      />

      <div className="rack-body">
        <RackSideButtons
          showMacros={showMacros}
          showVariations={showVariations}
          showChains={showChains}
          devicesCollapsed={devicesCollapsed}
          macroCount={rack.macroCount}
          onToggleMacros={() => setShowMacros((v) => !v)}
          onToggleVariations={() => setShowVariations((v) => !v)}
          onToggleChains={() => setShowChains((v) => !v)}
          onToggleDevices={() => setDevicesCollapsed((v) => !v)}
          onSetMacroCount={(count) => apply(rackPath, (r) => setMacroCount(r, Math.min(16, Math.max(1, count))))}
        />

        {showVariations && <VariationsPanel variations={rack.variations} />}

        {showMacros && (
        <MacroBank
          macros={rack.macros}
          macroCount={rack.macroCount}
          armed={armed !== null && samePath(armed.rackPath, rackPath)}
          rackPath={rackPath}
          mapping={mapping}
          onMapSource={parentRack ? dragMacroAsSource : undefined}
          parentKeys={parentKeys}
          liveValues={showLive}
          onReorder={(from, to) => apply(rackPath, (r) => reorderMacro(r, from, to))}
          onSwap={(a, b) => apply(rackPath, (r) => swapMacros(r, a, b))}
          onBindArmed={bindHere}
          onRename={(i, name) => apply(rackPath, (r) => renameMacro(r, i, name))}
          onRecolor={(i, colorIndex) => apply(rackPath, (r) => setMacroColor(r, i, colorIndex))}
        />
        )}

        {showChains && chains.length > 0 && (
          <ChainList
            chains={chains}
            selected={selectedChain}
            onSelect={setSelectedChain}
            drum={isDrumRack}
            onRecolor={(chainPath, colorIndex) => apply(rackPath, (r) => setChainColor(r, chainPath, colorIndex))}
          />
        )}
      </div>
      </section>

      {/* The rack's devices are SIBLINGS, not children: they continue the same
          row to the right. Nesting a nested rack inside this element is what
          made racks cascade downward and the row grow. */}
      {chain ? chain.devices.map(renderDevice) : null}

      <div className={`rack-boundary end depth-${Math.min(depth, 3)}`} aria-hidden="true" />
    </>
  );
}

/** A rack inside a rack: resolve it as a sub-rack view and render the same panel inline, one level down. */
function NestedRack({
  parent,
  device,
  rackPath,
  depth,
  collapsed,
  macroColors,
}: {
  parent: Rack;
  device: DeviceNode;
  rackPath: RackPath;
  depth: number;
  collapsed: boolean;
  macroColors: readonly string[];
}) {
  const nested = parent.subRack(device.path);
  if (!nested) return <DeviceRow device={device} rackPath={rackPath} macroColors={macroColors} collapsed={collapsed} />;
  return <RackPanel rack={nested} rackPath={[...rackPath, device.path]} depth={depth + 1} collapsible forceCollapsed={collapsed} />;
}
