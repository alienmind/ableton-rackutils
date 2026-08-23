import { describe, expect, test } from 'vitest';
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

  test('finds the mapped macro and its binding', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const macro0 = rack.macros[0];
    expect(macro0.binding).not.toBeNull();
    expect(macro0.binding?.targetName).toBe('ParamA');
    expect(macro0.binding?.rangeMin).toBe(0);
    expect(macro0.binding?.rangeMax).toBe(100);
    expect(macro0.binding?.inverted).toBe(false);
  });

  test('an unmapped parameter reports no binding on its macro', () => {
    const rack = Rack.parse(buildFixtureBytes());
    // Macro 1 (index 1) has no KeyMidi anywhere in the fixture.
    expect(rack.macros[1].binding).toBeNull();
  });

  test('a nested rack sharing macro index 0 does not leak into the outer rack (SCHEMA.md Q2)', () => {
    const rack = Rack.parse(buildFixtureBytes());
    // Only ParamA should be reachable as macro 0's binding, never InnerParam.
    expect(rack.macros[0].binding?.targetName).toBe('ParamA');
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
    expect(leaf.parameters.map((p) => p.name)).toEqual(['ParamA', 'ParamB']);
    expect(leaf.parameters[0].boundToMacro).toBe(0);
    expect(leaf.parameters[1].boundToMacro).toBeNull();

    expect(nested.isRack).toBe(true);
    expect(nested.name).toBe('Nested Rack');
    expect(nested.chains[0].devices[0].parameters[0].boundToMacro).toBe(0);
  });

  test('clone is independent of the original', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const cloned = rack.clone();
    expect(cloned.macros[0].binding?.targetName).toBe('ParamA');
    // Mutating the clone's DOM must not be possible through the original -
    // proven properly in mutate.test.ts; here just confirm they parse to the
    // same content independently (different Document instances).
    expect(cloned.name).toBe(rack.name);
  });

  test('serialize then parse round-trips the macro state', () => {
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.macros[0].binding?.targetName).toBe('ParamA');
    expect(roundTripped.variations).toHaveLength(2);
    expect(roundTripped.variations[0].values[1]).toBe(80);
  });
});
