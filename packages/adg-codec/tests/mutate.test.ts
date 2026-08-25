import { describe, expect, test } from 'vitest';
import { childValue } from '../src/dom';
import { Rack } from '../src/model';
import {
  bindParameter,
  invertBindingRange,
  moveMapping,
  renameMacro,
  renameRack,
  reorderMacro,
  setBindingRange,
  setChainColor,
  setMacroColor,
  setMacroCount,
  swapMacros,
  unbindMacro,
  unbindOne,
} from '../src/mutate';
import { buildDrumFixtureBytes, buildFixtureBytes } from './fixture';

/** Per-slot fields the typed model deliberately doesn't surface (annotations, defaults, the exclude flags) - read straight off the DOM to check a reorder carried them. */
const slotField = (rack: Rack, field: string, index: number) => childValue(rack.deviceEl, `${field}.${index}`);

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

  test('carries every per-slot field, not just name and colour', () => {
    // SCHEMA.md Q7 lists 7 per-slot families. A swap that moved only the two
    // the typed model happens to expose would leave a macro's annotation and
    // randomization flag behind on the slot it came from.
    const rack = Rack.parse(buildFixtureBytes());
    swapMacros(rack, 0, 1);
    expect(slotField(rack, 'MacroAnnotations', 0)).toBe('note 1');
    expect(slotField(rack, 'MacroAnnotations', 1)).toBe('note 0');
    expect(slotField(rack, 'MacroDefaults', 0)).toBe('1');
    expect(slotField(rack, 'MacroDefaults', 1)).toBe('0');
    expect(slotField(rack, 'ExcludeMacroFromRandomization', 0)).toBe('true');
    expect(slotField(rack, 'ExcludeMacroFromRandomization', 1)).toBe('false');
  });
});

describe('reorderMacro', () => {
  test('shifts the macros in between, it does not swap the two ends', () => {
    const rack = Rack.parse(buildFixtureBytes());
    renameMacro(rack, 0, 'Filter');
    const result = reorderMacro(rack, 0, 3);
    expect(result.ok).toBe(true);
    expect(rack.macros[3].name).toBe('Filter');
    // 1,2,3 slid up into 0,1,2 - a swap would have left 1 and 2 untouched.
    expect(rack.macros.slice(0, 3).map((m) => m.name)).toEqual(['Macro 2', 'Macro 3', 'Macro 4']);
  });

  test('carries the whole macro - bindings, colour, stored value, annotations', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const colorBefore = rack.macros[0].color;
    const valueBefore = rack.macros[0].value;
    setMacroColor(rack, 0, 11);
    reorderMacro(rack, 0, 4);
    expect(rack.macros[4].bindings.map((b) => b.targetName).sort()).toEqual(['ParamA', 'ParamC']);
    expect(rack.macros[0].bindings).toHaveLength(0);
    expect(rack.macros[4].color).toBe(11);
    expect(rack.macros[4].value).toBe(valueBefore);
    expect(slotField(rack, 'MacroAnnotations', 4)).toBe('note 0');
    expect(colorBefore).not.toBe(11); // the assertion above is not passing by accident
  });

  test('destroys nothing at the destination - the displaced macro shifts, it is not overwritten', () => {
    // The difference from moveMapping, which clears whatever the destination
    // was driving. Reordering is how a user expects dragging a knob to behave.
    const rack = Rack.parse(buildFixtureBytes());
    const paramB = rack.chains[0].devices[0].parameters[1];
    bindParameter(rack, 3, paramB);
    renameMacro(rack, 3, 'Keep Me');
    reorderMacro(rack, 0, 3);
    expect(rack.macros[2].name).toBe('Keep Me');
    expect(rack.macros[2].bindings.map((b) => b.targetName)).toEqual(['ParamB']);
  });

  test('works backwards, from a high slot to a low one', () => {
    const rack = Rack.parse(buildFixtureBytes());
    renameMacro(rack, 4, 'Late');
    reorderMacro(rack, 4, 1);
    expect(rack.macros[1].name).toBe('Late');
    expect(rack.macros.slice(2, 5).map((m) => m.name)).toEqual(['Macro 2', 'Macro 3', 'Macro 4']);
  });

  test('shifts variation values in lockstep across the whole range (Constraint 4)', () => {
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    const before = rack.variations.map((v) => [...v.values]);
    reorderMacro(rack, 0, 2);
    rack.variations.forEach((v, i) => {
      expect(v.values[2]).toBe(before[i][0]);
      expect(v.values[0]).toBe(before[i][1]);
      expect(v.values[1]).toBe(before[i][2]);
    });
  });

  test('is a no-op for from === to', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(reorderMacro(rack, 2, 2).ok).toBe(true);
    expect(rack.macros[0].bindings).toHaveLength(2);
  });
});

describe('setMacroCount', () => {
  test('changes the visible count and survives a round trip', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(setMacroCount(rack, 16).ok).toBe(true);
    expect(Rack.parse(rack.serialize()).macroCount).toBe(16);
  });

  test('shrinking hides macros without touching their bindings (SCHEMA.md Q7)', () => {
    const rack = Rack.parse(buildFixtureBytes());
    setMacroCount(rack, 1);
    moveMapping(rack, 0, 9); // macro 10, well above the visible count
    setMacroCount(rack, 2);
    expect(Rack.parse(rack.serialize()).macros[9].bindings).toHaveLength(2);
  });

  test('rejects counts outside 1..16', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(() => setMacroCount(rack, 0)).toThrow(RangeError);
    expect(() => setMacroCount(rack, 17)).toThrow(RangeError);
  });
});

describe('renameRack', () => {
  test('renames the rack and survives a round trip', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(renameRack(rack, 'Bass Machine').ok).toBe(true);
    expect(Rack.parse(rack.serialize()).name).toBe('Bass Machine');
  });

  test('leaves a nested rack\'s own name alone', () => {
    const rack = Rack.parse(buildFixtureBytes());
    renameRack(rack, 'Outer');
    expect(rack.chains[0].devices[1].name).toBe('Nested Rack');
  });
});

describe('setMacroColor', () => {
  test('sets the palette index and survives a round trip', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(setMacroColor(rack, 2, 42).ok).toBe(true);
    expect(Rack.parse(rack.serialize()).macros[2].color).toBe(42);
  });

  test('rejects a negative or fractional index', () => {
    const rack = Rack.parse(buildFixtureBytes());
    expect(() => setMacroColor(rack, 2, -1)).toThrow(RangeError);
    expect(() => setMacroColor(rack, 2, 1.5)).toThrow(RangeError);
  });
});

describe('unbindOne', () => {
  test('removes one target from a multi-target macro, leaving the others', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const paramA = rack.macros[0].bindings.find((b) => b.targetName === 'ParamA')!;
    const result = unbindOne(rack, 0, paramA.targetPath);
    expect(result.ok).toBe(true);
    expect(rack.macros[0].bindings.map((b) => b.targetName)).toEqual(['ParamC']);
  });

  test('keeps variation values while the macro still drives something else', () => {
    // The macro is still live, so its per-variation positions still mean
    // something. Clearing them here would break every variation in the rack.
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    const before = rack.variations.map((v) => v.values[0]);
    const paramA = rack.macros[0].bindings.find((b) => b.targetName === 'ParamA')!;
    unbindOne(rack, 0, paramA.targetPath);
    rack.variations.forEach((v, i) => expect(v.values[0]).toBe(before[i]));
  });

  test('clears variation values once the last target is removed', () => {
    const rack = Rack.parse(buildFixtureBytes({ withVariations: true }));
    for (const binding of [...rack.macros[0].bindings]) unbindOne(rack, 0, binding.targetPath);
    expect(rack.macros[0].bindings).toHaveLength(0);
    for (const v of rack.variations) expect(v.values[0]).toBe(-1);
  });

  test('refuses when the parameter belongs to a different macro', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const paramA = rack.macros[0].bindings.find((b) => b.targetName === 'ParamA')!;
    const result = unbindOne(rack, 4, paramA.targetPath);
    expect(result.ok).toBe(false);
    expect(result.warnings[0]).toMatch(/driven by macro 1/);
    expect(rack.macros[0].bindings).toHaveLength(2); // nothing removed
  });

  test('refuses on an unmapped parameter and on an unresolvable path', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const paramB = rack.chains[0].devices[0].parameters[1];
    expect(unbindOne(rack, 0, paramB.path).ok).toBe(false);
    expect(unbindOne(rack, 0, '99/99/99').ok).toBe(false);
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

describe('setChainColor', () => {
  test('sets the colour and stops Live treating it as auto-assigned', () => {
    const rack = Rack.parse(buildDrumFixtureBytes());
    const chain = rack.chains[0];
    expect(setChainColor(rack, chain.path, 12).ok).toBe(true);

    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.chains[0].colorIndex).toBe(12);
    // AutoColored must flip: Live recolours auto-coloured chains, which would
    // silently discard a colour the user picked.
    expect(roundTripped.chains[0].autoColored).toBe(false);
  });

  test('leaves the other chains alone', () => {
    const rack = Rack.parse(buildDrumFixtureBytes());
    const before = rack.chains.map((c) => c.colorIndex);
    setChainColor(rack, rack.chains[1].path, 5);
    const after = Rack.parse(rack.serialize()).chains.map((c) => c.colorIndex);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(5);
    expect(after[2]).toBe(before[2]);
  });

  test('fails cleanly on an unresolvable path, and rejects a bad index', () => {
    const rack = Rack.parse(buildDrumFixtureBytes());
    expect(setChainColor(rack, '99/99', 3).ok).toBe(false);
    expect(() => setChainColor(rack, rack.chains[0].path, -2)).toThrow(RangeError);
  });
});

describe('binding ranges (SCHEMA.md Q4)', () => {
  const firstBinding = (rack: Rack) => rack.macros[0].bindings[0];

  test('setBindingRange writes Min and Max on that target only', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const [a, b] = rack.macros[0].bindings;
    expect(setBindingRange(rack, 0, a.targetPath, { min: 20, max: 80 }).ok).toBe(true);

    const after = Rack.parse(rack.serialize()).macros[0].bindings;
    const moved = after.find((x) => x.targetPath === a.targetPath)!;
    const other = after.find((x) => x.targetPath === b.targetPath)!;
    expect([moved.rangeMin, moved.rangeMax]).toEqual([20, 80]);
    expect([other.rangeMin, other.rangeMax]).toEqual([b.rangeMin, b.rangeMax]);
  });

  test('invertBindingRange swaps Min and Max, and reports inverted', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const before = firstBinding(rack);
    expect(invertBindingRange(rack, 0, before.targetPath).ok).toBe(true);

    const after = Rack.parse(rack.serialize()).macros[0].bindings.find(
      (x) => x.targetPath === before.targetPath,
    )!;
    expect(after.rangeMin).toBe(before.rangeMax);
    expect(after.rangeMax).toBe(before.rangeMin);
    expect(after.inverted).toBe(true);
  });

  test('inverting twice is the identity', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const path = firstBinding(rack).targetPath;
    const before = firstBinding(rack);
    invertBindingRange(rack, 0, path);
    invertBindingRange(rack, 0, path);

    const after = Rack.parse(rack.serialize()).macros[0].bindings.find((x) => x.targetPath === path)!;
    expect([after.rangeMin, after.rangeMax, after.inverted]).toEqual([
      before.rangeMin,
      before.rangeMax,
      false,
    ]);
  });

  test('refuses a target this macro does not drive', () => {
    const rack = Rack.parse(buildFixtureBytes());
    const path = firstBinding(rack).targetPath;
    expect(setBindingRange(rack, 5, path, { min: 0, max: 1 }).ok).toBe(false);
    expect(invertBindingRange(rack, 5, path).ok).toBe(false);
    expect(setBindingRange(rack, 0, '99/99', { min: 0, max: 1 }).ok).toBe(false);
  });
});
