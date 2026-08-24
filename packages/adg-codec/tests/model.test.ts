import { describe, expect, test } from 'vitest';
import { decompress } from '../src/gzip';
import { Rack } from '../src/model';
import { buildFixtureBytes } from './fixture';

describe('Rack.parse', () => {
  test('reads the rack name and macro count', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(rack.name).toBe('Test Rack');
    expect(rack.macroCount).toBe(8);
  });

  test('always reports 16 macro slots regardless of visible count (SCHEMA.md Q7)', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(rack.macros).toHaveLength(16);
  });

  test('a macro driving two parameters at once reports both bindings', () => {
    // Real-world regression: a rack where macro 1 drove both a ChainSelector
    // and a nested rack's own macro simultaneously - completely normal Live
    // usage. An earlier version of this codec only ever found one.
    const rack = Rack.parse(buildFixtureBytes());
    const macro0 = rack.macros[0];
    expect(macro0.bindings).toHaveLength(2);
    expect(macro0.bindings.map((b) => b.targetName).sort()).toEqual(['ParamA', 'ParamC']);
  });

  test('an unmapped parameter reports no binding on its macro', () => {
    const rack = Rack.parse(buildFixtureBytes());
    // Macro 1 (index 1) has no KeyMidi anywhere in the fixture.
    expect(rack.macros[1].bindings).toHaveLength(0);
  });

  test('a nested rack sharing macro index 0 does not leak into the outer rack (SCHEMA.md Q2)', () => {
    const rack = Rack.parse(buildFixtureBytes());
    // Only ParamA/ParamC should be reachable as macro 0's bindings, never InnerParam.
    expect(rack.macros[0].bindings.map((b) => b.targetName)).not.toContain('InnerParam');
  });

  test('binding range and inversion', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const paramA = rack.macros[0].bindings.find((b) => b.targetName === 'ParamA')!;
    expect(paramA.rangeMin).toBe(0);
    expect(paramA.rangeMax).toBe(100);
    expect(paramA.inverted).toBe(false);
  });

  test('reports no variations when none are present', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(rack.variations).toHaveLength(0);
  });

  test('reads variations, all 16 slots, matching the macro-value scale (SCHEMA.md Q5)', () => {
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    expect(rack.variations).toHaveLength(2);
    expect(rack.variations[0].name).toBe('Variation 1');
    expect(rack.variations[0].values).toHaveLength(16);
    expect(rack.variations[0].values[0]).toBe(40);
    expect(rack.variations[0].values[1]).toBe(80);
    expect(rack.variations[0].values[2]).toBe(-1); // unmapped sentinel
  });

  test('walks the device tree, including a nested rack', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(rack.chains).toHaveLength(1);
    const devices = rack.chains[0].devices;
    expect(devices).toHaveLength(2);

    const [leaf, nested] = devices;
    expect(leaf.isRack).toBe(false);
    expect(leaf.type).toBe('TestSynth');
    expect(leaf.parameters.map((p) => p.name)).toEqual(['ParamA', 'ParamB', 'ParamC']);
    expect(leaf.parameters[0].boundToMacro).toBe(0);
    expect(leaf.parameters[1].boundToMacro).toBeNull();
    expect(leaf.parameters[2].boundToMacro).toBe(0);

    expect(nested.isRack).toBe(true);
    expect(nested.name).toBe('Nested Rack');
    expect(nested.chains[0].devices[0].parameters[0].boundToMacro).toBe(0);
  });

  test('clone is independent of the original', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const cloned = rack.clone();
    expect(cloned.macros[0].bindings.map((b) => b.targetName).sort()).toEqual(['ParamA', 'ParamC']);
    expect(cloned.name).toBe(rack.name);
  });

  test('serialize then parse round-trips the macro state', () => {
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.macros[0].bindings.map((b) => b.targetName).sort()).toEqual(['ParamA', 'ParamC']);
    expect(roundTripped.variations).toHaveLength(2);
    expect(roundTripped.variations[0].values[1]).toBe(80);
  });

  test('serialize always emits the XML declaration Live requires', () => {
    // Regression: a real rack, moved with `moveMapping`, silently refused
    // to load in Live at all - drag-and-drop rejected outright. Root cause:
    // XMLSerializer.serializeToString() never emits `<?xml ... ?>` (true in
    // every browser and jsdom, not a jsdom quirk), and every file Ableton
    // itself writes starts with it.
    const rack = Rack.parse(buildFixtureBytes());
    const xml = decompress(rack.serialize());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
  });
});
