/**
 * Runs the codec against real Ableton-saved racks, not the synthetic fixture.
 * These files are gitignored (packages/adg-codec/tests/fixtures/*.adg) and
 * generally won't exist in CI, so every test here skips cleanly when its file
 * is missing rather than failing the build. Locally, drop the three files
 * SCHEMA.md asks for and this becomes the strongest test in the suite: real
 * evidence instead of a hand-built stand-in.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { childValue } from '../src/dom';
import { Rack } from '../src/model';
import { moveMapping, renameMacro, renameRack, reorderMacro, setMacroColor, setMacroCount } from '../src/mutate';

const FIXTURES = join(__dirname, 'fixtures');
const path = (name: string) => join(FIXTURES, name);
const has = (name: string) => existsSync(path(name));
const load = (name: string) => new Uint8Array(readFileSync(path(name)));

describe.skipIf(!has('simplerack.adg'))('simplerack.adg', () => {
  test('parses and reports the 3 known macro mappings', () => {
    const rack = Rack.parse(load('simplerack.adg'));
    expect(rack.macroCount).toBe(8);
    // Confirmed by hand in SCHEMA.md: macros 1-3 map to Drive/Cutoff/Resonance.
    const mapped = rack.macros.filter((m) => m.bindings.length > 0);
    expect(mapped).toHaveLength(3);
    expect(mapped.map((m) => m.bindings[0].targetName).sort()).toEqual(['Filter Cutoff Frequency', 'Filter Drive Amount', 'Filter Resonance']);
  });

  test('round-trips through serialize without losing the mappings', () => {
    const rack = Rack.parse(load('simplerack.adg'));
    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.macros.filter((m) => m.bindings.length > 0)).toHaveLength(3);
  });

  test('moveMapping relocates a real mapping, ALL of it, and the file still parses back correctly', () => {
    const rack = Rack.parse(load('simplerack.adg'));
    const originalTargets = rack.macros[0].bindings.map((b) => b.targetName).sort();
    const result = moveMapping(rack, 0, 6);
    expect(result.ok).toBe(true);
    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.macros[0].bindings).toHaveLength(0);
    expect(roundTripped.macros[6].bindings.map((b) => b.targetName).sort()).toEqual(originalTargets);
  });

  test('reorderMacro carries the whole macro - name, colour and all bindings - to the new slot', () => {
    // What `moveMapping` deliberately does NOT do. Running move on a real rack
    // left the destination knob wearing its old name over someone else's
    // mapping, which is what this mutation exists to fix.
    const rack = Rack.parse(load('simplerack.adg'));
    const nameBefore = rack.macros[0].name;
    const colorBefore = rack.macros[0].color;
    const targetsBefore = rack.macros[0].bindings.map((b) => b.targetName).sort();
    const displacedBefore = rack.macros[1].name;
    expect(reorderMacro(rack, 0, 4).ok).toBe(true);

    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.macros[4].name).toBe(nameBefore);
    expect(roundTripped.macros[4].color).toBe(colorBefore);
    expect(roundTripped.macros[4].bindings.map((b) => b.targetName).sort()).toEqual(targetsBefore);
    // The macros it passed slid up by one rather than being overwritten.
    expect(roundTripped.macros[0].name).toBe(displacedBefore);
  });

  test('reorderMacro carries the per-slot fields the model does not expose', () => {
    const rack = Rack.parse(load('simplerack.adg'));
    const device = rack.deviceEl;
    const before = ['MacroAnnotations', 'MacroDefaults', 'ForceDisplayGenericValue', 'ExcludeMacroFromRandomization', 'ExcludeMacroFromSnapshots'].map(
      (field) => [field, childValue(device, `${field}.0`)] as const,
    );
    reorderMacro(rack, 0, 3);
    const after = Rack.parse(rack.serialize()).deviceEl;
    for (const [field, value] of before) expect(childValue(after, `${field}.3`)).toBe(value);
  });

  test('renameRack, setMacroCount and setMacroColor survive a real round trip', () => {
    const rack = Rack.parse(load('simplerack.adg'));
    renameRack(rack, 'Renamed Rack');
    setMacroCount(rack, 12);
    setMacroColor(rack, 1, 26);
    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.name).toBe('Renamed Rack');
    expect(roundTripped.macroCount).toBe(12);
    expect(roundTripped.macros[1].color).toBe(26);
  });
});

describe.skipIf(!has('withvariations.adg'))('withvariations.adg', () => {
  test('reads at least 3 variations, values matching the macro scale', () => {
    const rack = Rack.parse(load('withvariations.adg'));
    // At least 3 asked for - Live may add its own (e.g. an initial/default
    // snapshot), so this doesn't assert an exact count.
    expect(rack.variations.length).toBeGreaterThanOrEqual(3);
    for (const v of rack.variations) expect(v.values).toHaveLength(16);
  });

  test('moveMapping permutes all 3 variations in lockstep', () => {
    const rack = Rack.parse(load('withvariations.adg'));
    const from = rack.macros.findIndex((m) => m.bindings.length > 0);
    expect(from).toBeGreaterThanOrEqual(0);
    const to = rack.macros.findIndex((m) => m.bindings.length === 0);
    const before = rack.variations.map((v) => v.values[from]);
    moveMapping(rack, from, to);
    rack.variations.forEach((v, i) => {
      expect(v.values[to]).toBe(before[i]);
      expect(v.values[from]).toBe(-1);
    });
  });

  test('reorderMacro shifts every variation value across the range it walks', () => {
    const rack = Rack.parse(load('withvariations.adg'));
    const from = rack.macros.findIndex((m) => m.bindings.length > 0);
    expect(from).toBeGreaterThanOrEqual(0);
    const to = from + 3;
    const before = rack.variations.map((v) => [...v.values]);
    expect(reorderMacro(rack, from, to).ok).toBe(true);

    const after = Rack.parse(rack.serialize()).variations;
    after.forEach((v, i) => {
      expect(v.values[to]).toBe(before[i][from]);
      // Everything between slid back by one; nothing outside the range moved.
      for (let slot = from; slot < to; slot++) expect(v.values[slot]).toBe(before[i][slot + 1]);
      for (let slot = 0; slot < from; slot++) expect(v.values[slot]).toBe(before[i][slot]);
    });
  });
});

describe.skipIf(!has('drum-nested.adg'))('drum-nested.adg', () => {
  test('walks 3 levels of rack nesting (SCHEMA.md Q8)', () => {
    const rack = Rack.parse(load('drum-nested.adg'));
    // Drum Rack -> pad rack -> engine rack. Depth-first search for isRack nodes.
    function maxRackDepth(nodes: readonly { isRack: boolean; chains: readonly { devices: readonly unknown[] }[] }[], depth: number): number {
      let max = depth;
      for (const n of nodes) {
        if (!n.isRack) continue;
        for (const chain of n.chains) {
          max = Math.max(max, maxRackDepth(chain.devices as typeof nodes, depth + 1));
        }
      }
      return max;
    }
    let deepest = 0;
    for (const chain of rack.chains) deepest = Math.max(deepest, maxRackDepth(chain.devices, 1));
    expect(deepest).toBeGreaterThanOrEqual(2); // outer rack (0) -> pad rack (1) -> engine rack (2)
  });

  test('reads the pad note assignment off a real DrumBranchPreset (SCHEMA.md Q10)', () => {
    const rack = Rack.parse(load('drum-nested.adg'));
    expect(rack.deviceEl.tagName).toBe('DrumGroupDevice');
    const pads = rack.chains.filter((c) => c.receivingNote !== null);
    expect(pads.length).toBeGreaterThanOrEqual(1);
    // Confirmed by hand in SCHEMA.md Q10: this fixture's single pad is note 92.
    expect(pads[0].receivingNote).toBe(92);
    expect(pads[0].sendingNote).toBe(60);
  });

  test('a real pad rack is reachable as a sub-rack, with its own macros, editable in place', () => {
    const rack = Rack.parse(load('drum-nested.adg'));
    const padRack = rack.chains.flatMap((c) => c.devices).find((d) => d.isRack);
    expect(padRack).toBeDefined();

    const nested = rack.subRack(padRack!.path)!;
    expect(nested).not.toBeNull();
    expect(nested.macros).toHaveLength(16);
    expect(nested.name).toBe(padRack!.name);

    renameMacro(nested, 0, 'Pad Macro');
    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.subRack(padRack!.path)!.macros[0].name).toBe('Pad Macro');
    // The drum rack's own macro 0 is a different slot entirely.
    expect(roundTripped.macros[0].name).not.toBe('Pad Macro');
  });

  test('sub-rack views reach all three nesting levels independently', () => {
    const rack = Rack.parse(load('drum-nested.adg'));
    const padRack = rack.chains.flatMap((c) => c.devices).find((d) => d.isRack)!;
    const pad = rack.subRack(padRack.path)!;
    const engineNode = pad.chains.flatMap((c) => c.devices).find((d) => d.isRack);
    expect(engineNode).toBeDefined();
    // Paths are relative to the rack they came from - resolve the engine rack
    // against the PAD's handle, never the root's.
    expect(pad.subRack(engineNode!.path)).not.toBeNull();
    expect(pad.subRack(engineNode!.path)!.macros).toHaveLength(16);
  });
});

describe.skipIf(!has('drum-pads.adg'))('drum-pads.adg', () => {
  // AlienMind Fx Rack -> AlienMind Fx Drum Rack -> 3 named pads -> a Simpler
  // each, with Eq8/Compressor2/Delay/Reverb/StereoGain alongside the drum
  // rack. The drum rack is NOT the root here, which is the point: pads are
  // only reachable through a sub-rack view.
  const drumRackNode = (rack: Rack) => rack.chains.flatMap((c) => c.devices).find((d) => d.type === 'DrumGroupDevice')!;

  test('the drum rack is nested, and its pads are reachable through a sub-rack', () => {
    const rack = Rack.parse(load('drum-pads.adg'));
    expect(rack.deviceEl.tagName).toBe('InstrumentGroupDevice');
    // No pads at the top level - the root's own chain is an ordinary one.
    expect(rack.chains.every((c) => c.receivingNote === null)).toBe(true);

    const drums = rack.subRack(drumRackNode(rack).path)!;
    expect(drums.deviceEl.tagName).toBe('DrumGroupDevice');
    expect(drums.chains).toHaveLength(3);
    expect(drums.chains.every((c) => c.receivingNote !== null)).toBe(true);
  });

  test('pads keep their names and come in descending note order in the file', () => {
    // Document order is 92, 91, 90 - so anything laying out a pad grid has to
    // sort by note rather than trust the order it reads them in.
    const rack = Rack.parse(load('drum-pads.adg'));
    const pads = rack.subRack(drumRackNode(rack).path)!.chains;
    expect(pads.map((p) => p.receivingNote)).toEqual([92, 91, 90]);
    expect(pads.map((p) => p.name)).toEqual(['Riser Faze', 'Riser Moog', 'Riser + Decay']);
    expect(pads.every((p) => p.sendingNote === 60)).toBe(true);
  });

  test('native Ableton devices expose their parameters (SCHEMA.md Q11 regression)', () => {
    // This is the bug this fixture found: keying parameter detection on Q1's
    // `Timeable` wrapper reported ZERO parameters for every native device,
    // while mappings still resolved - so nothing else in the suite noticed.
    const rack = Rack.parse(load('drum-pads.adg'));
    const byType = new Map(rack.chains.flatMap((c) => c.devices).map((d) => [d.type, d]));
    for (const type of ['Eq8', 'Compressor2', 'Delay', 'Reverb', 'StereoGain']) {
      expect(byType.get(type)!.parameters.length).toBeGreaterThan(10);
    }
    // Simpler, two levels down inside a pad.
    const pad = rack.subRack(drumRackNode(rack).path)!.chains[0];
    expect(pad.devices[0].type).toBe('OriginalSimpler');
    expect(pad.devices[0].parameters.length).toBeGreaterThan(10);
  });

  test('the three real mappings show up as bound parameters on the right devices', () => {
    const rack = Rack.parse(load('drum-pads.adg'));
    const bound = rack.chains
      .flatMap((c) => c.devices)
      .flatMap((d) => d.parameters.filter((p) => p.boundToMacro !== null).map((p) => `${d.type}.${p.name}=M${p.boundToMacro! + 1}`))
      .sort();
    expect(bound).toEqual(['Delay.DryWet=M3', 'Reverb.DecayTime=M1', 'StereoGain.Gain=M2']);
  });

  test('a nested rack exposes its own macros as bindable parameters (Q11)', () => {
    // How an outer macro gets mapped to an inner rack's macro - confirmed real
    // in SCHEMA.md Q2/Q8. The drum rack's macros must be visible as targets
    // from the ROOT rack's device tree.
    const drums = drumRackNode(Rack.parse(load('drum-pads.adg')));
    expect(drums.parameters.map((p) => p.name)).toContain('MacroControls.0');
  });
});
