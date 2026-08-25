import { useState } from 'react';
import type { Chain } from '@rackutils/adg-codec';
import { ColorPicker } from './ColorPicker';
import { macroColor } from './macroColors';
import { noteName } from './noteName';

export interface ChainListProps {
  chains: readonly Chain[];
  selected: number;
  onSelect: (index: number) => void;
  /** Drum racks label rows with the pad's note and show them as a pad grid alongside. */
  drum: boolean;
  onRecolor: (chainPath: string, colorIndex: number) => void;
}

/**
 * A rack's chain list: a narrow column of rows, one per chain, exactly one
 * selected - Live's own layout. Only the selected chain's devices are drawn,
 * which is what keeps a whole rack on ONE row no matter how many chains it
 * has. Rendering every chain's devices stacked was the first cut's mistake and
 * is what made a drum rack overflow the page.
 */
export function ChainList({ chains, selected, onSelect, drum, onRecolor }: ChainListProps) {
  const [picking, setPicking] = useState<string | null>(null);
  // Pads are laid out by note, ascending. A real rack stores them in the
  // opposite order (92, 91, 90 in `drum-pads.adg`), so document order would
  // put the grid backwards. The ORIGINAL index travels with each entry -
  // selection indexes `rack.chains`, which is not reordered.
  const ordered = chains.map((chain, index) => ({ chain, index }));
  if (drum) ordered.sort((a, b) => (a.chain.receivingNote ?? 0) - (b.chain.receivingNote ?? 0));

  // Live's pad grid is 4 wide and reads from the BOTTOM left: the lowest note
  // sits bottom-left and rows climb. Rendering ascending order straight into a
  // grid puts the lowest note top-left, mirroring it vertically. Reversing by
  // row of four fixes the orientation without claiming to reproduce Live's
  // scroll window, whose geometry is unconfirmed (SCHEMA.md Q10).
  const padRows: (typeof ordered)[] = [];
  for (let i = 0; i < ordered.length; i += 4) padRows.push(ordered.slice(i, i + 4));
  const padGrid = padRows.reverse().flat();

  return (
    <div className="chain-list">
      {drum && (
        <div className="pad-grid">
          {padGrid.map(({ chain, index }) => (
            <button
              key={chain.path}
              type="button"
              className={`pad${index === selected ? ' selected' : ''}`}
              onClick={() => onSelect(index)}
              title={`${chain.name || 'Pad'} - ${chain.receivingNote === null ? 'no note' : noteName(chain.receivingNote)}`}
            >
              {chain.receivingNote === null ? '-' : noteName(chain.receivingNote)}
            </button>
          ))}
        </div>
      )}
      <div className="chain-rows">
        {ordered.map(({ chain, index }) => (
          <button
            key={chain.path}
            type="button"
            className={`chain-row${index === selected ? ' selected' : ''}`}
            onClick={() => onSelect(index)}
            title={chain.name || 'Chain'}
            // Live colours each chain row. The index -> colour table is not
            // confirmed (SCHEMA.md Q13), so this is the placeholder palette
            // and is not necessarily the colour Live would draw.
            style={chain.colorIndex === null ? undefined : ({ '--chain-color': macroColor(chain.colorIndex) } as React.CSSProperties)}
          >
            {drum && chain.receivingNote !== null && <span className="chain-note">{noteName(chain.receivingNote)}</span>}
            <span className="chain-row-name">{chain.name || 'Chain'}</span>
            <span
              className="chain-swatch"
              role="button"
              tabIndex={0}
              title="Colour"
              onClick={(e) => {
                e.stopPropagation();
                setPicking((p) => (p === chain.path ? null : chain.path));
              }}
              onKeyDown={(e) => e.key === 'Enter' && setPicking((p) => (p === chain.path ? null : chain.path))}
            />
            {picking === chain.path && (
              <ColorPicker
                current={chain.colorIndex ?? -1}
                onPick={(i) => {
                  onRecolor(chain.path, i);
                  setPicking(null);
                }}
                onClose={() => setPicking(null)}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
