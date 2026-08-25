import {
  AddMacroKnobs,
  ICON_NEUTRAL,
  ICON_OFF,
  ICON_ON,
  RemoveMacroKnobs,
  ToggleShowChains,
  ToggleShowMacroKnobs,
  ToggleShowMacroVariant,
  ToggleShowRacks,
} from './icons';

export interface RackSideButtonsProps {
  showMacros: boolean;
  showVariations: boolean;
  showChains: boolean;
  devicesCollapsed: boolean;
  macroCount: number;
  onToggleMacros: () => void;
  onToggleVariations: () => void;
  onToggleChains: () => void;
  onToggleDevices: () => void;
  onSetMacroCount: (count: number) => void;
}

/**
 * The vertical button column down the left edge of a rack, as Live has it.
 * Top to bottom: show/hide the macro knobs, add two macros, remove two,
 * show/hide the Macro Variations panel, collapse/expand the devices inside the
 * rack, show/hide the chain list.
 *
 * Macros come in PAIRS because the panel is two rows: Live's +/- step by two,
 * so the grid never ends up with a ragged column.
 *
 * A toggle shows its state the way Live does, by filling the button orange
 * when on and near-black when off - not by changing the glyph.
 */
export function RackSideButtons(props: RackSideButtonsProps) {
  const { showMacros, showVariations, showChains, devicesCollapsed, macroCount } = props;
  const { onToggleMacros, onToggleVariations, onToggleChains, onToggleDevices, onSetMacroCount } = props;

  const state = (on: boolean) => (on ? ICON_ON : ICON_OFF);

  return (
    <div className="rack-side">
      <button type="button" className="side-btn" onClick={onToggleMacros} title="Show/hide macro controls" aria-pressed={showMacros}>
        <ToggleShowMacroKnobs backgroundColor={state(showMacros)} />
      </button>
      <button type="button" className="side-btn" disabled={macroCount >= 16} onClick={() => onSetMacroCount(macroCount + 2)} title="Add two macros">
        <AddMacroKnobs />
      </button>
      <button type="button" className="side-btn" disabled={macroCount <= 2} onClick={() => onSetMacroCount(macroCount - 2)} title="Remove two macros">
        <RemoveMacroKnobs />
      </button>
      <button
        type="button"
        className="side-btn"
        onClick={onToggleVariations}
        title="Show/hide Macro Variations"
        aria-pressed={showVariations}
      >
        <ToggleShowMacroVariant backgroundColor={showVariations ? ICON_ON : ICON_NEUTRAL} />
      </button>
      <button
        type="button"
        className="side-btn"
        onClick={onToggleDevices}
        title={devicesCollapsed ? 'Expand the devices in this rack' : 'Collapse the devices in this rack'}
        aria-pressed={devicesCollapsed}
      >
        <ToggleShowRacks backgroundColor={state(!devicesCollapsed)} />
      </button>
      <button type="button" className="side-btn" onClick={onToggleChains} title="Show/hide chains" aria-pressed={showChains}>
        <ToggleShowChains backgroundColor={showChains ? ICON_ON : ICON_NEUTRAL} />
      </button>
    </div>
  );
}
