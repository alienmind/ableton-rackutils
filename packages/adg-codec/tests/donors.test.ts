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
import { Rack } from '../src/model';
import { moveMapping, reorderMacro, unbindMacro } from '../src/mutate';

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
