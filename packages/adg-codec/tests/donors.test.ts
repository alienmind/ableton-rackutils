/**
 * Runs the codec against the committed donor racks in `packages/adg-codec/
 * donors/`. Unlike `real-fixtures.test.ts`, whose files are gitignored and
 * absent in CI, these ship with the repo, so this is real Ableton-saved
 * evidence that runs on every build.
 *
 * `BS.adg` earns its place here twice over: it is the reference case for
 * applying a macro across parallel chains (doc/PLAN.md 4.3.3), and it is the
 * rack that exposed SCHEMA.md Q15.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MACRO_SLOTS, Rack, UNSET_MACRO_VALUE } from '../src/model';
import { applyContract, inspectContract, removeContractOption, macroNameFor } from '../src/contract';
import {
  bindParameter,
  colorChainMacros,
  distributeChainSelector,
  evenMacroCount,
  insertDeviceInEveryChain,
  insertMacroSlots,
  moveMapping,
  removeDevice,
  reorderMacro,
  resetMacro,
  setBindingRange,
  swapMacros,
  unbindMacro,
  unbindOne,
} from '../src/mutate';

const load = (name: string) => new Uint8Array(readFileSync(join(__dirname, '..', 'donors', name)));

const bindingNames = (rack: Rack, macroIndex: number) =>
  rack.macros[macroIndex].bindings.map((b) => b.targetName).sort();

describe('BS.adg - a macro on the rack device itself (SCHEMA.md Q15)', () => {
  test('macro 1 drives the rack own ChainSelector, not a device in a chain', () => {
    const rack = Rack.parse(load('BS.adg'));
    // The binding that a BranchPresets-scoped scan could not see. Its KeyMidi
    // sits on ChainSelector, a sibling of BranchPresets rather than a
    // descendant.
    expect(bindingNames(rack, 0)).toEqual(['ChainSelector']);
  });

  test('reports all nine mapped macros, not the eight inside the chains', () => {
    const rack = Rack.parse(load('BS.adg'));
    expect(rack.macros.filter((m) => m.bindings.length > 0).map((m) => m.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('moving that macro carries the ChainSelector binding with it', () => {
    const rack = Rack.parse(load('BS.adg'));
    expect(moveMapping(rack, 0, 11).ok).toBe(true);

    const after = Rack.parse(rack.serialize());
    expect(after.macros[0].bindings).toHaveLength(0);
    expect(bindingNames(after, 11)).toEqual(['ChainSelector']);
  });

  test('reordering leaves no binding stranded on the vacated slot', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = bindingNames(rack, 0);
    expect(reorderMacro(rack, 0, 4).ok).toBe(true);

    // The bug this guards: the ChainSelector KeyMidi keeping its old index, so
    // whichever macro landed there drove the chain selector.
    const after = Rack.parse(rack.serialize());
    expect(bindingNames(after, 4)).toEqual(before);
    expect(after.macros[0].bindings.map((b) => b.targetName)).not.toContain('ChainSelector');
  });

  test('unbinding it actually clears it', () => {
    const rack = Rack.parse(load('BS.adg'));
    expect(unbindMacro(rack, 0).ok).toBe(true);
    expect(Rack.parse(rack.serialize()).macros[0].bindings).toHaveLength(0);
  });
});

describe('BS.adg - one macro across parallel chains (doc/PLAN.md 4.3.3)', () => {
  test('a contract-style macro drives one target per chain', () => {
    const rack = Rack.parse(load('BS.adg'));
    // BS GAIN and GATE ON/OFF each drive their device in BOTH chains. This is
    // the shape the contract authors.
    expect(bindingNames(rack, 4)).toEqual(['Gain', 'Gain']);
    expect(bindingNames(rack, 8)).toEqual(['On', 'On']);
  });

  test('targets need not match across chains, and both survive a move', () => {
    const rack = Rack.parse(load('BS.adg'));
    // Macro 3 drives a Drift in one chain and an Eq8 band in the other. The
    // contract does not author this, but the codec must not lose it.
    expect(bindingNames(rack, 2)).toEqual(['Filter_Frequency', 'Freq']);

    expect(moveMapping(rack, 2, 13).ok).toBe(true);
    expect(bindingNames(Rack.parse(rack.serialize()), 13)).toEqual(['Filter_Frequency', 'Freq']);
  });

  test('round-trips every mapping without loss', () => {
    const rack = Rack.parse(load('BS.adg'));
    const count = (r: Rack) => r.macros.reduce((n, m) => n + m.bindings.length, 0);
    expect(count(rack)).toBe(19);
    expect(count(Rack.parse(rack.serialize()))).toBe(19);
  });
});

describe('PD.adg - a full rack with no room to shift (doc/PLAN.md 4.3.1)', () => {
  test('uses every macro slot, which is what forces a parent rack', () => {
    const rack = Rack.parse(load('PD.adg'));
    expect(rack.macroCount).toBe(16);
  });

  test('a contract macro can drive two parameters of different devices', () => {
    const rack = Rack.parse(load('PD.adg'));
    // PD GAIN drives the Utility's Gain and Drift's stereo depth at once.
    expect(bindingNames(rack, 15)).toEqual(['Gain', 'Global_StereoVoiceDepth']);
  });
});

describe('making room for contract macros on real racks (doc/PLAN.md 4.3.1)', () => {
  test('BS.adg has free slots, so the shift lands', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.macros.map((m) => m.bindings.map((b) => b.targetName).sort());
    expect(insertMacroSlots(rack, 2).ok).toBe(true);

    const after = Rack.parse(rack.serialize());
    expect(after.macros[0].bindings).toHaveLength(0);
    expect(after.macros[1].bindings).toHaveLength(0);
    // The ChainSelector binding travels with its macro like any other.
    expect(after.macros[2].bindings.map((b) => b.targetName)).toEqual(['ChainSelector']);
    for (let i = 0; i + 2 < 16; i++) {
      expect(after.macros[i + 2].bindings.map((b) => b.targetName).sort()).toEqual(before[i]);
    }
  });

  test('PD.adg is full, so the shift refuses instead of losing a macro', () => {
    const rack = Rack.parse(load('PD.adg'));
    const result = insertMacroSlots(rack, 1);
    expect(result.ok).toBe(false);
    // This is the case doc/PLAN.md 4.3.3 hands to a parent rack.
    expect(Rack.parse(rack.serialize()).macros[15].bindings.length).toBeGreaterThan(0);
  });
});

describe('inserting a contract device across every chain (doc/PLAN.md 4.3.3)', () => {
  const chainDeviceTags = (rack: Rack) =>
    rack.chains.map((chain) => chain.devices.map((d) => d.type));

  test('BS.adg already ends both chains in a Utility, so both are reused', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = chainDeviceTags(rack);
    const result = insertDeviceInEveryChain(rack, 'StereoGain');

    expect(result.ok).toBe(true);
    expect(result.devices).toHaveLength(2);
    expect(result.devices.every((d) => d.reused)).toBe(true);
    expect(chainDeviceTags(Rack.parse(rack.serialize()))).toEqual(before);
  });

  test('adds one per chain when the device is absent, at the end', () => {
    const rack = Rack.parse(load('BS.adg'));
    const result = insertDeviceInEveryChain(rack, 'AutoFilter2');

    expect(result.ok).toBe(true);
    expect(result.devices.every((d) => d.reused)).toBe(false);
    for (const tags of chainDeviceTags(Rack.parse(rack.serialize()))) {
      expect(tags[tags.length - 1]).toBe('AutoFilter2');
    }
  });

  test('is idempotent: a second run reuses what the first added', () => {
    const rack = Rack.parse(load('BS.adg'));
    insertDeviceInEveryChain(rack, 'AutoFilter2');
    const afterFirst = chainDeviceTags(Rack.parse(rack.serialize()));

    const second = insertDeviceInEveryChain(rack, 'AutoFilter2');
    expect(second.devices.every((d) => d.reused)).toBe(true);
    expect(chainDeviceTags(Rack.parse(rack.serialize()))).toEqual(afterFirst);
  });

  test('numbers the inserted device by its position in the chain (SCHEMA.md Q16)', () => {
    const rack = Rack.parse(load('BS.adg'));
    insertDeviceInEveryChain(rack, 'AutoFilter2');

    const doc = Rack.parse(rack.serialize()).document;
    for (const presets of Array.from(doc.getElementsByTagName('DevicePresets'))) {
      const ids = Array.from(presets.children).map((el) => el.getAttribute('Id'));
      // Id is an index into the sibling list, so a chain reads 0,1,2,... with
      // the new device continuing the run rather than jumping past the
      // document maximum.
      expect(ids).toEqual(ids.map((_, i) => String(i)));
    }
  });

  test('the inserted device carries no macro binding from the donor', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.macros.reduce((n, m) => n + m.bindings.length, 0);
    insertDeviceInEveryChain(rack, 'Gate');

    // The donor Gate was bound to BS.adg's own GATE ON/OFF macro. Harvesting
    // strips KeyMidi, so a fresh copy drives nothing until it is bound.
    expect(Rack.parse(rack.serialize()).macros.reduce((n, m) => n + m.bindings.length, 0)).toBe(before);
  });

  test('refuses a device with no donor rather than inventing one', () => {
    const rack = Rack.parse(load('BS.adg'));
    const result = insertDeviceInEveryChain(rack, 'NoSuchDevice');
    expect(result.ok).toBe(false);
    expect(result.warnings[0]).toContain('adg-harvest');
  });
});

describe('applyContract on BS.adg (doc/PLAN.md 4.3)', () => {
  const UTILITY_GAIN = { deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN', colorIndex: 69 };
  const GATE = { deviceTag: 'Gate', parameter: 'On', namePattern: '{name} GATE', colorIndex: 39 };

  test('fills the name pattern from the rack name', () => {
    expect(macroNameFor('{name} GAIN', 'BS')).toBe('BS GAIN');
  });

  test('recognises a convention the rack already follows and adds no slot for it', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.macros.map((m) => m.bindings.length).reduce((a, b) => a + b, 0);
    const count = rack.macroCount;
    // BS GAIN already drives Gain on the StereoGain in both chains, which is
    // exactly what this option asks for.
    const result = applyContract(rack, [UTILITY_GAIN]);

    expect(result.ok).toBe(true);
    // Recognised, so the bank is not widened and nothing new is bound.
    const after = Rack.parse(rack.serialize());
    expect(after.macroCount).toBe(count);
    expect(after.macros.map((m) => m.bindings.length).reduce((a, b) => a + b, 0)).toBe(before);
  });

  test('moves a recognised option into the slot the contract gives it', () => {
    const rack = Rack.parse(load('BS.adg'));
    // Slot comes from the contract, not from where this rack happened to put
    // it (doc/PLAN.md 4.3.1): BS GAIN sits on macro 5 here and the contract
    // says its options lead.
    const result = applyContract(rack, [UTILITY_GAIN]);

    expect(result.slots).toEqual([0]);
    const after = Rack.parse(rack.serialize());
    expect(after.macros[0].bindings.map((b) => b.targetName)).toEqual(['Gain', 'Gain']);
    // The macros it displaced kept theirs rather than being overwritten.
    expect(after.macros[1].bindings.map((b) => b.targetName)).toEqual(['ChainSelector']);
  });

  test('renames and recolours the slot it recognised', () => {
    const rack = Rack.parse(load('BS.adg'));
    applyContract(rack, [{ ...UTILITY_GAIN, namePattern: '{name} OUT', colorIndex: 13 }]);

    const macro = Rack.parse(rack.serialize()).macros[0];
    expect(macro.name).toBe('AlienMind Bass OUT');
    expect(macro.color).toBe(13);
  });

  test('puts a new option in the leading slot and drives every chain', () => {
    const rack = Rack.parse(load('BS.adg'));
    // AutoFilter2 is in no chain of BS.adg, so this is the insert path.
    const result = applyContract(rack, [
      { deviceTag: 'AutoFilter2', parameter: 'Filter_Frequency', namePattern: '{name} FILTER', colorIndex: 3 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.slots).toEqual([0]);

    const after = Rack.parse(rack.serialize());
    expect(after.macros[0].name).toBe('AlienMind Bass FILTER');
    expect(after.macros[0].color).toBe(3);
    // One binding per chain, which is what the parallel shape means.
    expect(after.macros[0].bindings).toHaveLength(after.chains.length);
    expect(after.macros[0].bindings.map((b) => b.targetName)).toEqual(['Filter_Frequency', 'Filter_Frequency']);
  });

  test('shifts the rack own macros right rather than overwriting them', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.macros.map((m) => m.name);
    applyContract(rack, [
      { deviceTag: 'AutoFilter2', parameter: 'Filter_Frequency', namePattern: '{name} FILTER' },
    ]);

    const after = Rack.parse(rack.serialize()).macros.map((m) => m.name);
    for (let i = 0; i + 1 < MACRO_SLOTS; i++) expect(after[i + 1]).toBe(before[i]);
  });

  test('is safe to re-run: the second pass changes nothing', () => {
    const rack = Rack.parse(load('BS.adg'));
    applyContract(rack, [UTILITY_GAIN, GATE]);
    const once = rack.serialize();

    const again = Rack.parse(once);
    const result = applyContract(again, [UTILITY_GAIN, GATE]);
    expect(result.ok).toBe(true);

    const names = (bytes: Uint8Array) => Rack.parse(bytes).macros.map((m) => `${m.name}:${m.bindings.length}`);
    expect(names(again.serialize())).toEqual(names(once));
  });

  test('refuses on a full rack instead of losing a macro', () => {
    const rack = Rack.parse(load('PD.adg'));
    const result = applyContract(rack, [
      { deviceTag: 'AutoFilter2', parameter: 'Filter_Frequency', namePattern: '{name} FILTER' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.warnings[0]).toContain('no room');
  });
});

describe('BS-VST3.adg - a plugin in a chain (SCHEMA.md Q17)', () => {
  test('the plugin is visible as a device, with no bindable parameters', () => {
    const rack = Rack.parse(load('BS-VST3.adg'));
    const plugin = rack.chains[2].devices.find((d) => d.type === 'Vst3Preset');
    expect(plugin).toBeDefined();
    // A Vst3Preset has no Device child and exposes no MidiControllerRange, so
    // there is nothing the editor may offer as a drop target.
    expect(plugin!.parameters).toHaveLength(0);
  });

  test('rack.plugins reports the class id and the chain it sits in (doc/PLAN.md 4.1)', () => {
    const rack = Rack.parse(load('BS-VST3.adg'));
    expect(rack.plugins).toEqual([
      // The four Uid fields, big-endian and concatenated (SCHEMA.md Q18). The
      // chain name is the user's own typing and the only readable string the
      // file puts near a plugin.
      { path: rack.plugins[0].path, type: 'Vst3Preset', uid: '41727475415649534d42525450726f63', chainName: 'MiniBrute' },
    ]);
  });

  test('the reported path resolves back to the preset element', () => {
    const rack = Rack.parse(load('BS-VST3.adg'));
    expect(rack.chains[2].devices.map((d) => d.path)).toContain(rack.plugins[0].path);
  });

  test('a rack with no plugin reports none', () => {
    expect(Rack.parse(load('BS.adg')).plugins).toEqual([]);
    // A rack of racks: the walk has to reach into the nested ones to be able
    // to answer the dependency question at all.
    expect(Rack.parse(load('KD.adg')).plugins).toEqual([]);
  });

  test('the plugin chain still round-trips, 77KB of opaque state included', () => {
    const rack = Rack.parse(load('BS-VST3.adg'));
    const before = rack.chains.map((c) => c.devices.map((d) => d.type));
    expect(Rack.parse(rack.serialize()).chains.map((c) => c.devices.map((d) => d.type))).toEqual(before);
  });

  test('a contract macro reaches all THREE chains, plugin chain included', () => {
    const rack = Rack.parse(load('BS-VST3.adg'));
    expect(rack.chains).toHaveLength(3);
    const result = applyContract(rack, [
      { deviceTag: 'AutoFilter2', parameter: 'Filter_Frequency', namePattern: '{name} FILTER' },
    ]);

    expect(result.ok).toBe(true);
    const macro = Rack.parse(rack.serialize()).macros[0];
    expect(macro.bindings).toHaveLength(3);
  });

  test('the existing gain convention is recognised across three chains', () => {
    const rack = Rack.parse(load('BS-VST3.adg'));
    const result = applyContract(rack, [
      { deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN' },
    ]);
    // Satisfied means one macro drives it on EVERY chain, so adding a chain
    // must not quietly downgrade the match. It is then moved to the front,
    // like any other option the contract owns.
    expect(result.slots).toEqual([0]);
  });
});

describe('the shape Live actually renders', () => {
  test('the visible macro count stays even', () => {
    const rack = Rack.parse(load('BS.adg'));
    expect(rack.macroCount).toBe(10);
    insertMacroSlots(rack, 1);

    // Live's +/- steps by two and every donor here is even (10, 10, 16). An
    // odd count still loads and draws the macro grid wrong: the rack renders
    // taller than a rack is allowed to be. Seen in Live on a rack this wrote.
    expect(Rack.parse(rack.serialize()).macroCount).toBe(12);
  });

  test('two options added at once also land on an even count', () => {
    const rack = Rack.parse(load('BS.adg'));
    insertMacroSlots(rack, 2);
    expect(Rack.parse(rack.serialize()).macroCount).toBe(12);
  });

  test('the name for a macro label comes from options, not the rack name', () => {
    const rack = Rack.parse(load('BS.adg'));
    // Defaulting to the rack name gives "AlienMind Bass GAIN", which Live wraps
    // onto a second line and grows every macro cell to fit.
    applyContract(rack, [{ deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN' }], { name: 'BS' });
    expect(Rack.parse(rack.serialize()).macros[0].name).toBe('BS GAIN');
  });
});

describe('one code, everywhere (doc/PLAN.md 4.3.1)', () => {
  const FILTER = {
    deviceTag: 'AutoFilter2',
    parameter: 'Filter_Frequency',
    namePattern: '{name} FILTER',
  };

  test('renames the rack, the macro and the inserted device to the same code', () => {
    const rack = Rack.parse(load('BS.adg'));
    applyContract(rack, [FILTER], { name: 'BS' });

    const after = Rack.parse(rack.serialize());
    expect(after.name).toBe('BS');
    expect(after.macros[0].name).toBe('BS FILTER');
    for (const chain of after.chains) {
      expect(chain.devices[chain.devices.length - 1].name).toBe('BS FILTER');
    }
  });

  test('leaves a device that was already there named as its owner called it', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.chains.map((c) => c.devices[c.devices.length - 1].name);
    // The Utility at the end of both chains is reused, not inserted.
    applyContract(rack, [{ deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN' }], { name: 'BS' });

    expect(Rack.parse(rack.serialize()).chains.map((c) => c.devices[c.devices.length - 1].name)).toEqual(before);
  });

  test('renameTheRack false keeps the rack name and still shortens the labels', () => {
    const rack = Rack.parse(load('BS.adg'));
    applyContract(rack, [FILTER], { name: 'BS', renameTheRack: false });

    const after = Rack.parse(rack.serialize());
    expect(after.name).toBe('AlienMind Bass');
    expect(after.macros[0].name).toBe('BS FILTER');
  });

  test('a separate device name pattern overrides the macro one', () => {
    const rack = Rack.parse(load('BS.adg'));
    applyContract(rack, [{ ...FILTER, deviceNamePattern: '{name} AF' }], { name: 'BS' });

    const after = Rack.parse(rack.serialize());
    expect(after.macros[0].name).toBe('BS FILTER');
    expect(after.chains[0].devices.at(-1)!.name).toBe('BS AF');
  });
});

describe('EQ Three, the three-macro option (doc/PLAN.md 4.3.2)', () => {
  test('one device, three macros, one per band', () => {
    const rack = Rack.parse(load('BS.adg'));
    const result = applyContract(
      rack,
      [
        { deviceTag: 'FilterEQ3', parameter: 'GainLo', namePattern: '{name} LO', colorIndex: 9 },
        { deviceTag: 'FilterEQ3', parameter: 'GainMid', namePattern: '{name} MID', colorIndex: 3 },
        { deviceTag: 'FilterEQ3', parameter: 'GainHi', namePattern: '{name} HI', colorIndex: 13 },
      ],
      { name: 'BS' },
    );

    expect(result.ok).toBe(true);
    const after = Rack.parse(rack.serialize());
    expect(after.macros.slice(0, 3).map((m) => m.name)).toEqual(['BS LO', 'BS MID', 'BS HI']);
    for (const m of after.macros.slice(0, 3)) {
      expect(m.bindings.map((b) => b.targetName)).toHaveLength(after.chains.length);
    }
  });

  test('the three options share ONE EQ per chain, not three', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.chains[0].devices.length;
    applyContract(
      rack,
      [
        { deviceTag: 'FilterEQ3', parameter: 'GainLo', namePattern: '{name} LO' },
        { deviceTag: 'FilterEQ3', parameter: 'GainMid', namePattern: '{name} MID' },
        { deviceTag: 'FilterEQ3', parameter: 'GainHi', namePattern: '{name} HI' },
      ],
      { name: 'BS' },
    );

    // The second and third options find the EQ the first inserted at the end
    // of the chain and reuse it. Three EQs in a row would be wrong.
    const after = Rack.parse(rack.serialize());
    expect(after.chains[0].devices.length).toBe(before + 1);
    expect(after.chains[0].devices.filter((d) => d.type === 'FilterEQ3')).toHaveLength(1);
  });

  test('BS-EQ3.adg maps its own EQ the same way, one macro per band', () => {
    const rack = Rack.parse(load('BS-EQ3.adg'));
    expect(bindingNames(rack, 9)).toEqual(['GainLo']);
    expect(bindingNames(rack, 10)).toEqual(['GainMid']);
    expect(bindingNames(rack, 11)).toEqual(['GainHi']);
  });
});

describe('adopting a macro the user already made (doc/PLAN.md 4.3.1)', () => {
  const gain = { deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN', colorIndex: 69 };

  test('KD.adg KICK GAIN is reported as adoptable, not as the contract own', () => {
    const rack = Rack.parse(load('KD.adg'));
    // One pad of four has a Utility with a macro on it, called by hand.
    expect(inspectContract(rack, [gain], { name: 'KD' })[0]).toMatchObject({
      state: 'partial',
      chainsCovered: 1,
      adoptable: { slot: 9, macroName: 'KICK GAIN' },
    });
  });

  test('a macro the contract itself would have written is not a question', () => {
    // BS.adg already has BS GAIN across both chains, which is satisfied and
    // nobody needs asking about.
    expect(inspectContract(Rack.parse(load('BS.adg')), [gain], { name: 'BS' })[0]).toMatchObject({
      state: 'satisfied',
      adoptable: null,
    });
  });

  test('without adopting, their knob is left driving nothing', () => {
    const rack = Rack.parse(load('KD.adg'));
    const result = applyContract(rack, [gain], { name: 'KD' });
    expect(result.warnings.join(' ')).toContain('now drives nothing');
    const after = Rack.parse(rack.serialize());
    expect(after.macros.find((m) => m.name === 'KICK GAIN')?.bindings).toEqual([]);
  });

  test('adopting keeps that knob, finishes its job and makes it the feature', () => {
    const rack = Rack.parse(load('KD.adg'));
    const result = applyContract(rack, [{ ...gain, adopt: true }], { name: 'KD' });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
    const after = Rack.parse(rack.serialize());
    // One macro, in the contract's leading slot, driving the Utility on every
    // pad - the one it already drove included.
    expect(result.slots).toEqual([0]);
    expect(after.macros[0].name).toBe('KD GAIN');
    expect(after.macros[0].color).toBe(69);
    expect(after.macros[0].bindings).toHaveLength(after.chains.length);
    // And no leftover: the name is gone because that knob IS the feature now.
    expect(after.macros.some((m) => m.name === 'KICK GAIN')).toBe(false);
    expect(after.macros.filter((m) => m.bindings.length === 0 && m.name !== `Macro ${m.index + 1}`)).toEqual([]);
  });

  test('adopting spends no macro slot, so the bank does not grow', () => {
    const before = Rack.parse(load('KD.adg')).macroCount;
    const rack = Rack.parse(load('KD.adg'));
    applyContract(rack, [{ ...gain, adopt: true }], { name: 'KD' });
    expect(Rack.parse(rack.serialize()).macroCount).toBe(before);
  });
});

describe('taking a parameter off a macro that drives several (Constraint 4)', () => {
  test('the macro keeps its variation values while it still drives something else', () => {
    // PD.adg is the donor with a variation in it, and two of its macros drive
    // two parameters each. The contract taking ONE of those used to wipe the
    // macro's stored variation values as if it had been emptied, which breaks
    // every variation in the rack.
    const rack = Rack.parse(load('PD.adg'));
    const donor = rack.macros.find((m) => m.bindings.length > 1);
    expect(donor).toBeDefined();
    const before = rack.variations.map((v) => v.values[donor!.index]);
    expect(rack.variations.length).toBeGreaterThan(0);

    const stolen = donor!.bindings[0];
    const param = { path: stolen.targetPath, name: stolen.targetName, boundToMacro: donor!.index };
    const result = bindParameter(rack, 15, param);

    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toContain(`cleared macro ${donor!.index + 1}`);
    const after = Rack.parse(rack.serialize());
    expect(after.variations.map((v) => v.values[donor!.index])).toEqual(before);
    expect(after.macros[donor!.index].bindings.length).toBe(donor!.bindings.length - 1);
  });

  test('a macro left driving nothing says so, and its variation values go', () => {
    const rack = Rack.parse(load('PD.adg'));
    const single = rack.macros.find((m) => m.bindings.length === 1)!;
    const stolen = single.bindings[0];
    const result = bindParameter(rack, 15, { path: stolen.targetPath, name: stolen.targetName, boundToMacro: single.index });

    expect(result.warnings.join(' ')).toContain('now drives nothing');
    const after = Rack.parse(rack.serialize());
    for (const variation of after.variations) expect(variation.values[single.index]).toBe(UNSET_MACRO_VALUE);
  });
});

describe('a macro driving a plugin parameter (SCHEMA.md Q20)', () => {
  /** The plugin binding is an integer on PluginParameterSettings, not a KeyMidi. */
  const pluginMacro = (rack: Rack): number =>
    Number(
      Array.from(rack.document.getElementsByTagName('MacroControlIndex'))[0]?.getAttribute('Value') ?? NaN,
    );

  test('BS-VST3-mapped.adg binds its plugin parameter by index', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    expect(pluginMacro(rack)).toBe(12);
  });

  test('the macro reports the binding, rather than reading as unmapped', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    const [binding] = rack.macros[12].bindings;
    // No KeyMidi anywhere near it: this comes from MacroControlIndex on the
    // exposed parameter (SCHEMA.md Q20). Its range is the plugin normalized
    // 0..1, not the 0..127 an Ableton parameter carries.
    expect(binding.plugin).toEqual({ uid: '41727475415649534d42525450726f63', parameterId: 70, power: false });
    expect(binding.targetName).toBe('Parameter 70');
    expect([binding.rangeMin, binding.rangeMax]).toEqual([0, 1]);
  });

  test('an empty slot still reads as unmapped', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    expect(rack.macros[13].bindings).toHaveLength(0);
  });

  test('editing that binding range is refused rather than written in the wrong shape', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    const [binding] = rack.macros[12].bindings;
    const result = setBindingRange(rack, 12, binding.targetPath, { min: 0, max: 64 });
    expect(result.ok).toBe(false);
    expect(result.warnings.join(' ')).toContain('plugin parameter');
  });

  test('unbinding it writes -1 and leaves the parameter exposed', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    const [binding] = rack.macros[12].bindings;
    expect(unbindOne(rack, 12, binding.targetPath).ok).toBe(true);
    const after = Rack.parse(rack.serialize());
    expect(pluginMacro(after)).toBe(-1);
    expect(after.macros[12].bindings).toHaveLength(0);
    // The PluginParameterSettings element stays: the parameter is still
    // exposed on the device, it just stops being driven (SCHEMA.md Q20).
    expect(after.document.getElementsByTagName('PluginParameterSettings')).toHaveLength(1);
  });

  test('moving that macro carries the plugin binding with it', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    expect(moveMapping(rack, 12, 14).ok).toBe(true);
    expect(pluginMacro(Rack.parse(rack.serialize()))).toBe(14);
  });

  test('swapping carries it in both directions', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    expect(swapMacros(rack, 12, 3).ok).toBe(true);
    expect(pluginMacro(Rack.parse(rack.serialize()))).toBe(3);
  });

  test('shifting slots for a contract carries it too', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    expect(insertMacroSlots(rack, 2).ok).toBe(true);
    // The bug this guards: the index staying at 12 while its macro moved to 14,
    // leaving the plugin driven by whatever landed on 12.
    expect(pluginMacro(Rack.parse(rack.serialize()))).toBe(14);
  });

  test('unbinding clears it to -1 rather than deleting the exposed parameter', () => {
    const rack = Rack.parse(load('BS-VST3-mapped.adg'));
    expect(unbindMacro(rack, 12).ok).toBe(true);

    const after = Rack.parse(rack.serialize());
    expect(pluginMacro(after)).toBe(-1);
    // The parameter stays exposed on the device, it just stops being driven.
    expect(after.document.getElementsByTagName('PluginParameterSettings')).toHaveLength(1);
  });
});


describe('KD.adg - a rack of racks (SCHEMA.md Q22)', () => {
  const kd = () => Rack.parse(load('KD.adg'));
  const subRack = (rack: Rack, name: string) => {
    for (const chain of rack.chains) {
      const device = chain.devices.find((d) => d.isRack && d.name === name);
      if (device) return rack.subRack(device.path)!;
    }
    throw new Error(`no nested rack called "${name}"`);
  };

  test('a parent macro driving a child rack macro belongs to the PARENT', () => {
    const rack = kd();
    // Live draws all ten of this rack's macros as mapped. Six of them drive a
    // macro of the rack on a pad, and every one of those was credited to the
    // child before Q22.
    expect(rack.macros.slice(0, 10).every((m) => m.bindings.length > 0)).toBe(true);
    expect(bindingNames(rack, 3)).toEqual(['KICK SEL']);
  });

  test('the child does not also claim it', () => {
    const selector = subRack(kd(), 'AlienMind KD Kick Selector');
    // Its own two macros, and nothing standing in for the parent's mappings.
    expect(selector.macros.filter((m) => m.bindings.length > 0).map((m) => m.index)).toEqual([0, 1]);
  });

  test('a child macro on the child own ChainSelector stays the child (SCHEMA.md Q15)', () => {
    const selector = subRack(kd(), 'AlienMind KD Kick Selector');
    expect(bindingNames(selector, 1)).toEqual(['ChainSelector']);
  });

  test('a binding on a rack macro is named after that macro, not MacroControls.N', () => {
    // What Live shows on the knob at the other end. The raw tag says nothing.
    expect(bindingNames(kd(), 4)).toEqual(['Rumble Length']);
  });

  test('moving a macro carries its child-rack bindings with it', () => {
    const rack = kd();
    expect(moveMapping(rack, 3, 11).ok).toBe(true);

    const after = Rack.parse(rack.serialize());
    expect(after.macros[3].bindings).toHaveLength(0);
    expect(bindingNames(after, 11)).toEqual(['KICK SEL']);
    // The child is untouched by the parent's move: its own macro still drives
    // its own chain selector.
    expect(bindingNames(subRack(after, 'AlienMind KD Kick Selector'), 1)).toEqual(['ChainSelector']);
  });

  test('reordering leaves nothing stranded on the vacated slot', () => {
    const rack = kd();
    const before = rack.macros.slice(0, 10).map((m) => m.bindings.map((b) => b.targetName).sort());
    expect(reorderMacro(rack, 0, 9).ok).toBe(true);

    const after = Rack.parse(rack.serialize()).macros.map((m) => m.bindings.map((b) => b.targetName).sort());
    expect(after[9]).toEqual(before[0]);
    for (let i = 0; i < 9; i++) expect(after[i]).toEqual(before[i + 1]);
  });
});

describe('options that are not a knob on a device (doc/PLAN.md 4.3.2)', () => {
  const COMPRESSOR = { deviceTag: 'Compressor2', namePattern: '{name} COMP' };
  const SELECT = { parameter: 'ChainSelector', namePattern: '{name} SEL', colorIndex: 13 };

  test('a device option with no parameter spends no macro slot', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.macroCount;
    const result = applyContract(rack, [COMPRESSOR], { name: 'BS' });

    expect(result.ok).toBe(true);
    expect(result.slots).toEqual([-1]);

    const after = Rack.parse(rack.serialize());
    expect(after.macroCount).toBe(before);
    // One Compressor per chain, named from the code, driven by nothing.
    expect(after.chains.map((c) => c.devices[c.devices.length - 1].type)).toEqual(['Compressor2', 'Compressor2']);
    expect(after.chains.map((c) => c.devices[c.devices.length - 1].name)).toEqual(['BS COMP', 'BS COMP']);
  });

  test('the chain selector option binds the rack own parameter and adds no device', () => {
    const rack = Rack.parse(load('KD.adg'));
    const devicesBefore = rack.chains.map((c) => c.devices.length);
    // The shape KD.adg carries by hand as KICK SEL (SCHEMA.md Q15).
    const result = applyContract(rack, [SELECT], { name: 'KD', renameTheRack: false });

    expect(result.ok).toBe(true);
    const after = Rack.parse(rack.serialize());
    expect(after.chains.map((c) => c.devices.length)).toEqual(devicesBefore);
    expect(after.macros[0].name).toBe('KD SEL');
    expect(after.macros[0].bindings.map((b) => b.targetName)).toEqual(['ChainSelector']);
  });

  test('a rack that already selects its own chains is recognised, not given a second knob', () => {
    // BS.adg macro 1 drives its own ChainSelector already.
    const rack = Rack.parse(load('BS.adg'));
    const count = rack.macroCount;
    const result = applyContract(rack, [SELECT], { name: 'BS', renameTheRack: false });

    expect(result.slots).toEqual([0]);
    const after = Rack.parse(rack.serialize());
    expect(after.macroCount).toBe(count);
    expect(after.macros.filter((m) => m.bindings.some((b) => b.targetName === 'ChainSelector'))).toHaveLength(1);
  });

  test('the leading order is the order of the options, not of what was already there', () => {
    const rack = Rack.parse(load('BS.adg'));
    // The chain selector is already on macro 1 and the gain on macro 5; the
    // filter is new. The contract decides which of them leads.
    const result = applyContract(
      rack,
      [
        SELECT,
        { deviceTag: 'AutoFilter2', parameter: 'Filter_Frequency', namePattern: '{name} FILTER' },
        { deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN' },
      ],
      { name: 'BS', renameTheRack: false },
    );

    expect(result.slots).toEqual([0, 1, 2]);
    const after = Rack.parse(rack.serialize());
    expect(after.macros.slice(0, 3).map((m) => m.name)).toEqual(['BS SEL', 'BS FILTER', 'BS GAIN']);
    expect(after.macros[0].bindings.map((b) => b.targetName)).toEqual(['ChainSelector']);
    expect(after.macros[2].bindings.map((b) => b.targetName)).toEqual(['Gain', 'Gain']);
  });
});

describe('option settings that are not macros (SCHEMA.md Q14)', () => {
  const value = (rack: Rack, devicePath: string, tag: string, leaf: string) => {
    const preset = rack.resolveTarget(devicePath)!;
    const device = preset.getElementsByTagName('StereoGain')[0];
    return device.getElementsByTagName(tag)[0].getElementsByTagName(leaf)[0].getAttribute('Value');
  };

  test('bass mono is written into the Utility of every chain', () => {
    const rack = Rack.parse(load('BS.adg'));
    const result = applyContract(
      rack,
      [
        {
          deviceTag: 'StereoGain',
          parameter: 'Gain',
          namePattern: '{name} GAIN',
          values: [
            { path: ['BassMono', 'Manual'], value: false },
            { path: ['BassMonoFrequency', 'Manual'], value: 90 },
          ],
        },
      ],
      { name: 'BS', renameTheRack: false },
    );
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);

    // Written even onto the Utility that was already in the chain: the tick is
    // a statement about what the rack does, not about what was inserted.
    const after = Rack.parse(rack.serialize());
    for (const chain of after.chains) {
      const utility = chain.devices.find((d) => d.type === 'StereoGain')!;
      expect(value(after, utility.path, 'BassMono', 'Manual')).toBe('false');
      expect(value(after, utility.path, 'BassMonoFrequency', 'Manual')).toBe('90');
    }
  });

  test('a value the device does not have is reported rather than invented', () => {
    const rack = Rack.parse(load('BS.adg'));
    const result = applyContract(
      rack,
      [{ deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN', values: [{ path: ['NoSuchThing'], value: 1 }] }],
      { name: 'BS', renameTheRack: false },
    );
    expect(result.warnings.some((w) => w.includes('NoSuchThing'))).toBe(true);
  });
});

describe('what the rack already does about an option (doc/PLAN.md 4.3.1)', () => {
  const GAIN = { deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN' };
  const FILTER = { deviceTag: 'AutoFilter2', parameter: 'Filter_Frequency', namePattern: '{name} FILTER' };

  test('reports satisfied, partial and absent', () => {
    const rack = Rack.parse(load('BS.adg'));
    const [gain, filter] = inspectContract(rack, [GAIN, FILTER]);

    expect(gain.state).toBe('satisfied');
    expect(gain.slot).toBe(4);
    expect(gain.chainsCovered).toBe(rack.chains.length);
    expect(filter.state).toBe('absent');
    expect(filter.slot).toBeNull();
  });

  test('a device in one chain and not the other is partial, and applying binds both', () => {
    const rack = Rack.parse(load('BS.adg'));
    // Take the Utility out of the second chain, leaving the first one's.
    const stray = rack.chains[1].devices.find((d) => d.type === 'StereoGain')!;
    expect(removeDevice(rack, stray.path).ok).toBe(true);

    const [before] = inspectContract(rack, [GAIN]);
    expect(before.state).toBe('partial');
    expect(before.chainsCovered).toBe(1);

    expect(applyContract(rack, [GAIN], { name: 'BS', renameTheRack: false }).ok).toBe(true);
    const after = Rack.parse(rack.serialize());
    expect(after.macros[0].bindings).toHaveLength(after.chains.length);
    expect(inspectContract(after, [GAIN])[0].state).toBe('satisfied');
  });
});

describe('unticking an option (doc/PLAN.md 4.3.1)', () => {
  const FILTER = { deviceTag: 'AutoFilter2', parameter: 'Filter_Frequency', namePattern: '{name} FILTER', colorIndex: 3 };

  test('removes the device it added, the macro, and the slot', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = { count: rack.macroCount, names: rack.macros.map((m) => m.name), devices: rack.chains.map((c) => c.devices.length) };

    applyContract(rack, [FILTER], { name: 'BS', renameTheRack: false });
    expect(removeContractOption(rack, FILTER, { name: 'BS' }).ok).toBe(true);
    // Removal takes slots off one at a time and leaves the parity to the end
    // of the batch, which here is one call.
    evenMacroCount(rack);

    const after = Rack.parse(rack.serialize());
    expect(after.macroCount).toBe(before.count);
    expect(after.macros.map((m) => m.name)).toEqual(before.names);
    expect(after.chains.map((c) => c.devices.length)).toEqual(before.devices);
    expect(inspectContract(after, [FILTER])[0].state).toBe('absent');
  });

  test('leaves a device that was already in the rack, and says so', () => {
    const rack = Rack.parse(load('BS.adg'));
    const GAIN = { deviceTag: 'StereoGain', parameter: 'Gain', namePattern: '{name} GAIN' };
    applyContract(rack, [GAIN], { name: 'BS', renameTheRack: false });

    const result = removeContractOption(rack, GAIN, { name: 'BS' });
    expect(result.warnings.some((w) => w.includes('already in the rack'))).toBe(true);

    // The Utility stays; only the macro goes.
    const after = Rack.parse(rack.serialize());
    expect(after.chains.every((c) => c.devices.some((d) => d.type === 'StereoGain'))).toBe(true);
    expect(after.macros.some((m) => m.name === 'BS GAIN')).toBe(false);
  });

  test('a full rack refuses the option and leaves its variations alone', () => {
    // PD.adg is the donor with a variation, and the one with all 16 slots in
    // use, so a refusal here must not have touched anything on the way.
    const rack = Rack.parse(load('PD.adg'));
    const before = rack.variations.map((v) => v.values.join(','));
    // Not the Gate or the Utility: this rack already satisfies those, and a
    // satisfied option needs no slot. EQ Three is one it does not have.
    const EQ = { deviceTag: 'FilterEQ3', parameter: 'GainLo', namePattern: '{name} LO' };

    expect(applyContract(rack, [EQ], { name: 'PD', renameTheRack: false }).ok).toBe(false);
    expect(Rack.parse(rack.serialize()).variations.map((v) => v.values.join(','))).toEqual(before);
  });
});

describe('resetting one macro (editor)', () => {
  test('unbinds it and puts its name and colour back', () => {
    const rack = Rack.parse(load('BS.adg'));
    expect(rack.macros[4].name).toBe('BS GAIN');
    expect(resetMacro(rack, 4).ok).toBe(true);

    const after = Rack.parse(rack.serialize()).macros[4];
    expect(after.bindings).toHaveLength(0);
    expect(after.name).toBe('Macro 5');
    // -1 is Live's "no colour set" (SCHEMA.md Q13), not an index.
    expect(after.color).toBe(-1);
  });

  test('the slot stays where it is, and its neighbours are untouched', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.macros.map((m) => `${m.name}:${m.bindings.length}`);
    const count = rack.macroCount;
    resetMacro(rack, 4);

    const after = Rack.parse(rack.serialize());
    expect(after.macroCount).toBe(count);
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) {
      expect(`${after.macros[i].name}:${after.macros[i].bindings.length}`).toBe(before[i]);
    }
  });

  test('a variation stops holding a value for it', () => {
    const rack = Rack.parse(load('PD.adg'));
    expect(resetMacro(rack, 15).ok).toBe(true);
    for (const variation of Rack.parse(rack.serialize()).variations) {
      expect(variation.values[15]).toBe(UNSET_MACRO_VALUE);
    }
  });
});

describe('chain selector ranges (SCHEMA.md Q24)', () => {
  const rangesOf = (rack: Rack) =>
    Array.from(rack.branchPresetsEl!.children).map((chain) => {
      const range = chain.getElementsByTagName('BranchSelectorRange')[0];
      const value = (tag: string) => range.getElementsByTagName(tag)[0]?.getAttribute('Value');
      return `${value('Min')}-${value('Max')}/${value('CrossfadeMin')}-${value('CrossfadeMax')}`;
    });

  test('splits 0..127 evenly, with the crossfade edges flush', () => {
    const rack = Rack.parse(load('BS.adg'));
    expect(distributeChainSelector(rack).ok).toBe(true);
    // Two chains, so 64 wide each. The shape KD's eight-chain Kick rack has.
    expect(rangesOf(Rack.parse(rack.serialize()))).toEqual(['0-63/0-63', '64-127/64-127']);
  });

  test('leaves a rack that already splits its range alone', () => {
    const kd = Rack.parse(load('KD.adg'));
    const kick = kd.chains[0].devices.find((d) => d.isRack)!;
    const inner = kd.subRack(kick.path)!;
    const before = rangesOf(inner);

    const result = distributeChainSelector(inner);
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toContain('already');
    expect(rangesOf(inner)).toEqual(before);
  });

  test('refuses a rack with one chain rather than writing a range that selects nothing', () => {
    const kd = Rack.parse(load('KD.adg'));
    const rumble = kd.chains[1].devices.find((d) => d.isRack)!;
    expect(distributeChainSelector(kd.subRack(rumble.path)!).ok).toBe(false);
  });

  test('the chain select feature carries the ranges with it', () => {
    const rack = Rack.parse(load('BS.adg'));
    applyContract(rack, [{ parameter: 'ChainSelector', namePattern: '{name} SEL' }], { name: 'BS', renameTheRack: false });
    expect(rangesOf(Rack.parse(rack.serialize()))).toEqual(['0-63/0-63', '64-127/64-127']);
  });
});

describe('a feature that lands in a pad rack (doc/PLAN.md 4.3.2)', () => {
  const kickPad = (rack: Rack) => {
    const pad = rack.chains[0];
    return { path: pad.devices.find((d) => d.isRack)!.path, name: pad.name };
  };

  test('a drum rack chain selector goes to the pad rack, in two links', () => {
    const rack = Rack.parse(load('KD.adg'));
    const pad = kickPad(rack);
    const result = applyContract(
      rack,
      [{ parameter: 'ChainSelector', namePattern: '{target} SEL', targetRack: pad.path, targetName: pad.name }],
      { name: 'KD', renameTheRack: false },
    );

    expect(result.ok).toBe(true);
    const after = Rack.parse(rack.serialize());
    // Outer macro drives the pad rack's macro; that macro drives its selector.
    expect(after.macros[0].name).toBe('Kick SEL');
    const inner = after.subRack(kickPad(after).path)!;
    expect(after.macros[0].bindings.map((b) => b.targetName)).toEqual([inner.macros[1].name]);
    expect(inner.macros[1].bindings.map((b) => b.targetName)).toEqual(['ChainSelector']);
  });

  test('it reuses the selector macro the pad rack already has', () => {
    // KD's Kick rack already carries KICK SEL on its macro 2, which is the
    // whole shape this feature reproduces.
    const rack = Rack.parse(load('KD.adg'));
    const pad = kickPad(rack);
    applyContract(
      rack,
      [{ parameter: 'ChainSelector', namePattern: '{target} SEL', targetRack: pad.path, targetName: pad.name }],
      { name: 'KD', renameTheRack: false },
    );

    const after = Rack.parse(rack.serialize());
    const inner = after.subRack(kickPad(after).path)!;
    expect(inner.macros[1].name).toBe('KICK SEL');
    expect(inner.macros.filter((m) => m.bindings.some((b) => b.targetName === 'ChainSelector'))).toHaveLength(1);
  });

  test('it is recognised on a second run rather than bound twice', () => {
    const rack = Rack.parse(load('KD.adg'));
    const pad = kickPad(rack);
    const feature = { parameter: 'ChainSelector', namePattern: '{target} SEL', targetRack: pad.path, targetName: pad.name };
    applyContract(rack, [feature], { name: 'KD', renameTheRack: false });

    const again = Rack.parse(rack.serialize());
    const padAgain = kickPad(again);
    const result = applyContract(again, [{ ...feature, targetRack: padAgain.path }], { name: 'KD', renameTheRack: false });
    expect(result.slots).toEqual([0]);
    expect(again.macroCount).toBe(rack.macroCount);
    expect(inspectContract(again, [{ ...feature, targetRack: padAgain.path }])[0].state).toBe('satisfied');
  });
});

describe('colour follows the chain (SCHEMA.md Q13)', () => {
  test('a chain colour reaches the macros that only drive that chain', () => {
    const rack = Rack.parse(load('KD.adg'));
    // The Rumble pad. Its four macros drive nothing outside it, and the drum
    // rack's own macro 2 drives an AutoFilter in the Kick pad instead.
    const rumble = rack.chains[1];
    expect(colorChainMacros(rack, rumble.path, 41).ok).toBe(true);

    const after = Rack.parse(rack.serialize());
    const inRumble = (index: number) =>
      after.macros[index].bindings.every((b) => after.resolveTarget(rumble.path)!.contains(after.resolveTarget(b.targetPath)!));

    for (const macro of after.macros) {
      if (macro.bindings.length === 0) continue;
      if (inRumble(macro.index)) expect(macro.color).toBe(41);
      else expect(macro.color).not.toBe(41);
    }
  });

  test('a macro that also drives something else keeps its own colour', () => {
    const rack = Rack.parse(load('BS.adg'));
    // BS.adg's macro 4 drives four parameters across BOTH chains, so it
    // belongs to neither - which is what a macro across chains is.
    const before = rack.macros[3].color;
    colorChainMacros(rack, rack.chains[0].path, 41);
    expect(Rack.parse(rack.serialize()).macros[3].color).toBe(before);
  });
});
