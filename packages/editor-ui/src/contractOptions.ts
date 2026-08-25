import type { ContractDevice, DeviceValue } from '@rackutils/adg-codec';

/**
 * The contract's options, as offered in the strip above the rack
 * (doc/PLAN.md 4.3.2). Each one is a piece of a convention a producer wants
 * every rack of theirs to present the same way.
 *
 * The ORDER here is the order the macros land in, on every rack, whatever
 * order they were ticked in. That is the whole familiarity claim: the leading
 * knobs are the ones you put there, in the same places (4.3.1).
 *
 * Everything here traces to a donor. Device tags, parameter names and the
 * paths in `values` are read off `packages/adg-codec/donors/`, never guessed:
 * a device assembled from imagination loads in Live without complaint and
 * behaves wrong (Constraint 7).
 */
export interface ContractSetting {
  id: string;
  label: string;
  /** Written when ticked, and its opposite when unticked - both, so unticking is not "leave whatever the donor had". */
  on: readonly DeviceValue[];
  off: readonly DeviceValue[];
  /** Shown under the checkbox. For anything a preset cannot actually carry, say so here. */
  note?: string;
}

export interface ContractOptionSpec {
  id: string;
  label: string;
  /**
   * The feature can be added more than once, each instance pointing at a
   * different nested rack. Chain select on a drum rack is one per pad
   * (SCHEMA.md Q24); everything else is one per rack.
   */
  repeatable?: boolean;
  /**
   * The feature applies INSIDE a nested rack, and the settings column offers
   * which one. On a drum rack that is the only way it means anything: a pad
   * answers to a note, so a selector on the drum rack itself does nothing.
   */
  targetsNestedRack?: boolean;
  /** The codec's half of it. `namePattern` and `colorIndex` here are DEFAULTS; the convention may override both. */
  device: ContractDevice;
  settings?: readonly ContractSetting[];
  /** One line under the tile, for something the option cannot do. */
  note?: string;
}

/** `SideChain/OnOff/Manual`, on both the Gate and the Compressor - the switch a preset does carry (SCHEMA.md Q14). */
const sidechain: ContractSetting = {
  id: 'sidechain',
  label: 'Sidechain',
  on: [{ path: ['SideChain', 'OnOff', 'Manual'], value: true }],
  off: [{ path: ['SideChain', 'OnOff', 'Manual'], value: false }],
  note: 'The switch travels with the rack. The source track does not - set it once per Set, in Live.',
};

export const CONTRACT_OPTIONS: readonly ContractOptionSpec[] = [
  {
    id: 'select',
    label: 'Chain Select',
    repeatable: true,
    targetsNestedRack: true,
    // No device: the chain selector is a parameter of the rack itself
    // (SCHEMA.md Q15), and `donors/KD.adg` carries exactly this by hand as
    // KICK SEL.
    device: { parameter: 'ChainSelector', namePattern: '{name} SEL', colorIndex: 13 },
    note: 'Splits the selector range evenly across the chains so the knob picks one. A drum rack has to point this at a pad: its own pads answer to notes, not to a selector.',
  },
  {
    id: 'utility',
    label: 'Utility Gain',
    device: { deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN', colorIndex: 69 },
    settings: [
      {
        id: 'bassMono',
        label: 'Bass mono',
        // Two real parameters on StereoGain, both in donors/PD.adg.
        on: [
          { path: ['BassMono', 'Manual'], value: true },
          { path: ['BassMonoFrequency', 'Manual'], value: 120 },
        ],
        off: [{ path: ['BassMono', 'Manual'], value: false }],
      },
    ],
  },
  {
    id: 'gate',
    label: 'Gate',
    device: { deviceTag: 'Gate', parameter: 'On', namePattern: '{name} GATE', colorIndex: 39 },
    settings: [sidechain],
  },
  {
    id: 'compressor',
    label: 'Compressor',
    // No macro at all: not every piece of a convention is a knob, and one that
    // is not should not spend a leading slot.
    device: { deviceTag: 'Compressor2', namePattern: '{name} COMP' },
    settings: [sidechain],
  },
  {
    id: 'autofilter',
    label: 'Auto Filter',
    // `{name} AUTOFILTER` is what doc/PLAN.md 4.3.2 wrote down, and at 13
    // characters it is past what a knob holds on one line: 12 fits, 21 wraps
    // and grows the whole rack (SCHEMA.md Q19). FILTER says the same thing.
    device: { deviceTag: 'AutoFilter2', parameter: 'Filter_Frequency', namePattern: '{name} FILTER', colorIndex: 3 },
  },
  {
    id: 'eqLo',
    label: 'EQ Three - Lo',
    device: { deviceTag: 'FilterEQ3', parameter: 'GainLo', namePattern: '{name} LO', deviceNamePattern: '{name} EQ', colorIndex: 9 },
  },
  {
    id: 'eqMid',
    label: 'EQ Three - Mid',
    device: { deviceTag: 'FilterEQ3', parameter: 'GainMid', namePattern: '{name} MID', deviceNamePattern: '{name} EQ', colorIndex: 9 },
  },
  {
    id: 'eqHi',
    label: 'EQ Three - Hi',
    // The three bands share ONE EQ per chain: whichever of them lands first
    // inserts it and the others find it (doc/PLAN.md 4.3.2).
    device: { deviceTag: 'FilterEQ3', parameter: 'GainHi', namePattern: '{name} HI', deviceNamePattern: '{name} EQ', colorIndex: 9 },
  },
];

export const optionSpec = (id: string): ContractOptionSpec | undefined => CONTRACT_OPTIONS.find((o) => o.id === id);
