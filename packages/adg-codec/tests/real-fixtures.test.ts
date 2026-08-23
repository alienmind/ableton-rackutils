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
import { Rack } from '../src/model';
import { moveMapping } from '../src/mutate';

const FIXTURES = join(__dirname, 'fixtures');
const path = (name: string) => join(FIXTURES, name);
const has = (name: string) => existsSync(path(name));
const load = (name: string) => new Uint8Array(readFileSync(path(name)));

describe.skipIf(!has('simplerack.adg'))('simplerack.adg', () => {
  test('parses and reports the 3 known macro mappings', () => {
    const rack = Rack.parse(load('simplerack.adg'));
    expect(rack.macroCount).toBe(8);
    // Confirmed by hand in SCHEMA.md: macros 1-3 map to Drive/Cutoff/Resonance.
    const mapped = rack.macros.filter((m) => m.binding);
    expect(mapped).toHaveLength(3);
    expect(mapped.map((m) => m.binding?.targetName).sort()).toEqual(['Filter Cutoff Frequency', 'Filter Drive Amount', 'Filter Resonance']);
  });

  test('round-trips through serialize without losing the mappings', () => {
    const rack = Rack.parse(load('simplerack.adg'));
    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.macros.filter((m) => m.binding)).toHaveLength(3);
  });

  test('moveMapping relocates a real mapping and the file still parses back correctly', () => {
    const rack = Rack.parse(load('simplerack.adg'));
    const originalTarget = rack.macros[0].binding?.targetName;
    const result = moveMapping(rack, 0, 6);
    expect(result.ok).toBe(true);
    const roundTripped = Rack.parse(rack.serialize());
    expect(roundTripped.macros[0].binding).toBeNull();
    expect(roundTripped.macros[6].binding?.targetName).toBe(originalTarget);
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
    const from = rack.macros.findIndex((m) => m.binding);
    expect(from).toBeGreaterThanOrEqual(0);
    const to = rack.macros.findIndex((m) => !m.binding);
    const before = rack.variations.map((v) => v.values[from]);
    moveMapping(rack, from, to);
    rack.variations.forEach((v, i) => {
      expect(v.values[to]).toBe(before[i]);
      expect(v.values[from]).toBe(-1);
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
});
