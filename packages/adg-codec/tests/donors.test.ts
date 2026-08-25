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
import { MACRO_SLOTS, Rack } from '../src/model';
import { applyContract, macroNameFor } from '../src/contract';
import { insertDeviceInEveryChain, insertMacroSlots, moveMapping, reorderMacro, unbindMacro } from '../src/mutate';

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
    const result = insertDeviceInEveryChain(rack, 'FilterEQ3');
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

  test('recognises a convention the rack already follows and does not shift', () => {
    const rack = Rack.parse(load('BS.adg'));
    const before = rack.macros.map((m) => m.bindings.length);
    // BS GAIN already drives Gain on the StereoGain in both chains, which is
    // exactly what this option asks for.
    const result = applyContract(rack, [UTILITY_GAIN]);

    expect(result.ok).toBe(true);
    expect(result.slots).toEqual([4]);
    expect(Rack.parse(rack.serialize()).macros.map((m) => m.bindings.length)).toEqual(before);
  });

  test('renames and recolours the slot it recognised', () => {
    const rack = Rack.parse(load('BS.adg'));
    applyContract(rack, [{ ...UTILITY_GAIN, namePattern: '{name} OUT', colorIndex: 13 }]);

    const macro = Rack.parse(rack.serialize()).macros[4];
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
    // must not quietly downgrade the match.
    expect(result.slots).toEqual([4]);
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
    expect(Rack.parse(rack.serialize()).macros[4].name).toBe('BS GAIN');
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

