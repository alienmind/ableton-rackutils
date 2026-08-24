import { PLACEHOLDER_COLOR_INDICES, macroColor } from './macroColors';

export interface ColorPickerProps {
  current: number;
  onPick: (colorIndex: number) => void;
  onClose: () => void;
}

/** Swatch popover. The palette it offers is a placeholder, not Live's - see `macroColors.ts`. */
export function ColorPicker({ current, onPick, onClose }: ColorPickerProps) {
  return (
    <div className="color-picker" onMouseLeave={onClose}>
      {PLACEHOLDER_COLOR_INDICES.map((i) => (
        <button
          key={i}
          type="button"
          className={`color-swatch${i === current ? ' current' : ''}`}
          style={{ background: macroColor(i) }}
          onClick={() => onPick(i)}
          title={`Colour ${i}`}
        >
          <span className="sr-only">{`Colour ${i}`}</span>
        </button>
      ))}
    </div>
  );
}
