import { describe, expect, test } from 'vitest';
import { Rack } from '../src/model';
import { bindParameter, moveMapping, renameMacro, swapMacros, unbindMacro } from '../src/mutate';
import { buildFixtureBytes } from './fixture';

describe('moveMapping', () => {
  test('transfers ALL of a macro\'s bindings to the new slot, not just one', () => {
    // Regression: a real rack had macro 1 driving two parameters at once;
    // an earlier version of moveMapping only relocated one of them, leaving
    // the other still pointing at the source slot after the "move".
    const rack = Rack.parse(buildFixtureBytes());
    const result = moveMapping(rack, 0, 1);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(rack.macros[0].bindings).toHaveLength(0);
    expect(rack.macros[1].bindings.map((b) => b.targetName).sort()).toEqual(['ParamA', 'ParamC']);
  });

  test('fails cleanly when the source macro has no mapping', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const result = moveMapping(rack, 1, 2);
    expect(result.ok).toBe(false);
  });

  test('clears and warns about occupied destination bindings, plural', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const paramB = rack.chains[0].devices[0].parameters[1];
    bindParameter(rack, 1, paramB); // macro 1 (index 1) now also has a binding
    const result = moveMapping(rack, 0, 1);
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toMatch(/cleared 1 existing binding on macro 2/);
    expect(rack.macros[1].bindings.map((b) => b.targetName).sort()).toEqual(['ParamA', 'ParamC']);
  });

  test('permutes every variation in lockstep (Constraint 4, SCHEMA.md Q6)', () => {
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    const before = rack.variations.map((v) => [...v.values]);
    moveMapping(rack, 0, 2);
    rack.variations.forEach((v, i) => {
      expect(v.values[2]).toBe(before[i][0]);
      expect(v.values[0]).toBe(-1);
    });
  });

  test('does not touch a nested rack sharing the same macro index (SCHEMA.md Q2)', () => {
    const rack = Rack.parse(buildFixtureBytes());
    moveMapping(rack, 0, 5);
    const nested = rack.chains[0].devices[1];
    expect(nested.chains[0].devices[0].parameters[0].boundToMacro).toBe(0);
  });

  test('is a no-op for from === to', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const result = moveMapping(rack, 0, 0);
    expect(result.ok).toBe(true);
    expect(rack.macros[0].bindings).toHaveLength(2);
  });
});

describe('swapMacros', () => {
  test('exchanges ALL bindings both ways, names, colors and stored values', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const nameBefore1 = rack.macros[1].name;
    const colorBefore0 = rack.macros[0].color;
    const colorBefore1 = rack.macros[1].color;
    renameMacro(rack, 0, 'Filter');
    swapMacros(rack, 0, 1);
    expect(rack.macros[1].bindings.map((b) => b.targetName).sort()).toEqual(['ParamA', 'ParamC']);
    expect(rack.macros[0].bindings).toHaveLength(0);
    expect(rack.macros[1].name).toBe('Filter');
    expect(rack.macros[0].name).toBe(nameBefore1);
    expect(rack.macros[1].color).toBe(colorBefore0);
    expect(rack.macros[0].color).toBe(colorBefore1);
  });

  test('exchanges variation values both ways', () => {
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    const before = rack.variations.map((v) => [...v.values]);
    swapMacros(rack, 0, 1);
    rack.variations.forEach((v, i) => {
      expect(v.values[0]).toBe(before[i][1]);
      expect(v.values[1]).toBe(before[i][0]);
    });
  });
});

describe('bindParameter', () => {
  test('binds an unmapped parameter to a macro', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const paramB = rack.chains[0].devices[0].parameters[1];
    const result = bindParameter(rack, 3, paramB);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(rack.macros[3].bindings.map((b) => b.targetName)).toEqual(['ParamB']);
  });

  test('ADDS a new target to a macro without clearing its existing ones', () => {
    // A macro driving several parameters is normal - bindParameter must not
    // treat "this macro already has a binding" as something to clear.
    const rack = Rack.parse(buildFixtureBytes());
    const paramB = rack.chains[0].devices[0].parameters[1];
    const result = bindParameter(rack, 0, paramB); // macro 0 already drives ParamA + ParamC
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(rack.macros[0].bindings.map((b) => b.targetName).sort()).toEqual(['ParamA', 'ParamB', 'ParamC']);
  });

  test('clears only the specific previous owner of the target (Constraint 5), leaving that macro\'s other bindings alone', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const paramA = rack.chains[0].devices[0].parameters[0];
    const result = bindParameter(rack, 4, paramA); // ParamA was macro 0's
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("macro 1's binding"))).toBe(true);
    expect(rack.macros[4].bindings.map((b) => b.targetName)).toEqual(['ParamA']);
    // Macro 0 still drives ParamC - only ParamA's ownership moved.
    expect(rack.macros[0].bindings.map((b) => b.targetName)).toEqual(['ParamC']);
  });

  test('is a no-op when the parameter is already bound to this exact macro', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const paramA = rack.macros[0].bindings.find((b) => b.targetName === 'ParamA')!;
    const result = bindParameter(rack, 0, { path: paramA.targetPath, name: 'ParamA', boundToMacro: 0 });
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(rack.macros[0].bindings).toHaveLength(2); // unchanged, not doubled
  });

  test('fails cleanly on an unresolvable path', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const result = bindParameter(rack, 2, { path: '99/99/99', name: 'Ghost', boundToMacro: null });
    expect(result.ok).toBe(false);
  });
});

describe('unbindMacro', () => {
  test('removes ALL of a macro\'s bindings and clears variation values', () => {
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    const result = unbindMacro(rack, 0);
    expect(result.ok).toBe(true);
    expect(rack.macros[0].bindings).toHaveLength(0);
    for (const v of rack.variations) expect(v.values[0]).toBe(-1);
  });

  test('is a no-op on an already-unmapped macro', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const result = unbindMacro(rack, 5);
    expect(result.ok).toBe(true);
  });
});

describe('renameMacro', () => {
  test('renames the macro', () => {
    const rack = Rack.parse(buildFixtureBytes());
    renameMacro(rack, 2, 'Resonance');
    expect(rack.macros[2].name).toBe('Resonance');
  });
});

describe('clone isolation', () => {
  test('mutating a clone does not affect the original', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const clone = rack.clone();
    moveMapping(clone, 0, 1);
    expect(clone.macros[0].bindings).toHaveLength(0);
    expect(rack.macros[0].bindings).toHaveLength(2);
  });
});
