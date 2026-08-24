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
 * show/hide the Macro Variations panel, collapse/expand the devices inside
 * the rack, show/hide the chain list.
 *
 * Macros come in PAIRS because the panel is two rows: Live's +/- step by two,
 * so the grid never ends up with a ragged column.
 */
export function RackSideButtons(props: RackSideButtonsProps) {
  const { showMacros, showVariations, showChains, devicesCollapsed, macroCount } = props;
  const { onToggleMacros, onToggleVariations, onToggleChains, onToggleDevices, onSetMacroCount } = props;

  return (
    <div className="rack-side">
      <button type="button" className={`side-btn${showMacros ? ' on' : ''}`} onClick={onToggleMacros} title="Show/hide macro controls">
        <span aria-hidden="true">◎</span>
      </button>
      <button type="button" className="side-btn" disabled={macroCount >= 16} onClick={() => onSetMacroCount(macroCount + 2)} title="Add two macros">
        +
      </button>
      <button type="button" className="side-btn" disabled={macroCount <= 2} onClick={() => onSetMacroCount(macroCount - 2)} title="Remove two macros">
        -
      </button>
      <button
        type="button"
        className={`side-btn${showVariations ? ' on' : ''}`}
        onClick={onToggleVariations}
        title="Show/hide Macro Variations"
      >
        <span aria-hidden="true">⊕</span>
      </button>
      <button
        type="button"
        className={`side-btn${devicesCollapsed ? ' on' : ''}`}
        onClick={onToggleDevices}
        title={devicesCollapsed ? 'Expand the devices in this rack' : 'Collapse the devices in this rack'}
      >
        <span aria-hidden="true">▤</span>
      </button>
      <button type="button" className={`side-btn${showChains ? ' on' : ''}`} onClick={onToggleChains} title="Show/hide chains">
        <span aria-hidden="true">≡</span>
      </button>
    </div>
  );
}
