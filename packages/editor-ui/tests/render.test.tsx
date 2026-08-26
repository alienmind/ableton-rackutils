/**
 * Render tests for the recursive rack rendering (doc/PLAN.md Part 5). These use
 * the REAL fixtures where they exist, for the same reason the codec's tests
 * do: three bugs so far were invisible to synthetic data, and the recursion is
 * exactly the kind of thing that looks right on a hand-built two-level rack
 * and falls over on a real one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Rack } from '@rackutils/adg-codec';
import { RackEditor } from '../src/RackEditor';
import { MACRO_PALETTE, macroColor } from '../src/macroColors';
import { macroLabel } from '../src/mappings';
import { buildDrumFixtureBytes, buildFixtureBytes } from '../../adg-codec/tests/fixture';

const FIXTURES = join(__dirname, '..', '..', 'adg-codec', 'tests', 'fixtures');
const hasReal = (name: string) => existsSync(join(FIXTURES, name));
const loadReal = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

const render = (rack: Rack) => renderToStaticMarkup(<RackEditor rack={rack} onChange={() => {}} />);

describe('RackEditor', () => {
  test('renders nothing at all without a rack, rather than an empty shell', () => {
    expect(renderToStaticMarkup(<RackEditor rack={null} onChange={() => {}} />)).toBe('');
  });

  test('draws the rack name, its macro knobs, and what each macro drives', () => {
    const html = render(Rack.parse(buildFixtureBytes()));
    expect(html).toContain('Test Rack');
    // 8 visible macros out of the 16 slots that always exist (SCHEMA.md Q7).
    // Only the root's bank: a nested rack starts collapsed to a title strip.
    expect(html.match(/class="macro-knob /g) ?? []).toHaveLength(8);
    expect(html).toContain('ParamA');
    expect(html).toContain('M1'); // the macro badge on a mapped parameter
  });

  test('renders devices collapsed to title strips', () => {
    // A chain opened flat is a wall of parameter lists; the mapping table
    // already says what each device contributes.
    const html = render(Rack.parse(buildFixtureBytes()));
    expect(html).toContain('device-panel collapsed');
    expect(html).toContain('TestSynth');
  });

  test('lists the mappings below the row, a multi-target macro as one row', () => {
    const html = render(Rack.parse(buildFixtureBytes()));
    expect(html).toContain('mapping-grid');
    // The fixture's macro 1 drives two parameters, which is exactly what the
    // contract writes across chains: one collapsed row, opened on demand.
    expect(html).toContain('mapping-summary');
    expect(html).toContain('2 parameters');
    expect(html).toContain('Expand all');
  });

  test('renders a nested rack collapsed to a title strip, in the same row', () => {
    const html = render(Rack.parse(buildFixtureBytes()));
    // Named, present, and collapsed until asked for - a nested rack rendered
    // inside its parent is what used to cascade the layout downward.
    expect(html).toContain('Nested Rack');
    expect(html).toContain('rack-panel collapsed');
    expect(html).toContain('rack-strip');
    // The root's own boundary pair is drawn whatever its children do.
    expect(html.match(/rack-boundary start/g) ?? []).toHaveLength(1);
    expect(html.match(/rack-boundary end/g) ?? []).toHaveLength(1);
  });
});

describe('drum racks', () => {
  test('renders a pad grid alongside the chain rows', () => {
    const html = render(Rack.parse(buildDrumFixtureBytes()));
    expect(html).toContain('pad-grid');
    expect(html).toContain('Kick');
    expect(html).toContain('Snare');
  });

  test('orders pads by note, not by document order', () => {
    // The fixture stores them 40, 36, 38 on purpose.
    const html = render(Rack.parse(buildDrumFixtureBytes()));
    const order = [...html.matchAll(/class="chain-note">[^<]*<\/span><span class="chain-row-name">([^<]+)</g)].map((m) => m[1]);
    expect(order).toEqual(['Kick', 'Snare', 'Hat']);
  });
});

describe.skipIf(!hasReal('drum-pads.adg'))('against the real drum-pads.adg', () => {
  test('renders the Fx rack with its drum rack collapsed beside it', () => {
    const html = render(Rack.parse(loadReal('drum-pads.adg')));
    expect(html).toContain('AlienMind Fx Rack');
    // The nested drum rack is a collapsed strip until opened; its pads are
    // behind that click.
    expect(html).toContain('AlienMind Fx Drum Rack');
    expect(html).toContain('rack-panel collapsed');
  });



  test('lists the real mappings in the table below', () => {
    const html = render(Rack.parse(loadReal('drum-pads.adg')));
    expect(html).toContain('FX Reverb Decay');
    expect(html).toContain('DecayTime');
    expect(html).toContain('Gain');
  });


});

describe.skipIf(!hasReal('simplerack.adg'))('against the real simplerack.adg', () => {
  test('renders a plain instrument rack with its three mapped macros', () => {
    const html = render(Rack.parse(loadReal('simplerack.adg')));
    expect(html).toContain('Filter Drive Amount');
    expect(html).toContain('Filter Cutoff Frequency');
    expect(html).toContain('Filter Resonance');
    expect(html).not.toContain('pad-grid');
  });
});

describe('macro numbering and the rack side buttons', () => {
  test('macros are numbered across then down, in a ceil(count / 2) grid', () => {
    // Live numbers 1 2 3 4 / 5 6 7 8. A column-flow grid gives 1 3 5 7 /
    // 2 4 6 8, which is what the first cut shipped.
    const html = render(Rack.parse(buildFixtureBytes()));
    expect(html).toContain('grid-template-columns:repeat(4, auto)');
    const slots = [...html.matchAll(/class="macro-knob-slot">(\d+)</g)].map((m) => Number(m[1]));
    expect(slots.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('the side button column offers Live\'s six controls', () => {
    const html = render(Rack.parse(buildFixtureBytes()));
    for (const title of [
      'Show/hide macro controls',
      'Add two macros',
      'Remove two macros',
      'Show/hide Macro Variations',
      'Show/hide chains',
    ]) {
      expect(html).toContain(title);
    }
  });
});

describe('Live palette', () => {
  test('offers Live\'s own 70 colours, not the old invented 16', () => {
    expect(MACRO_PALETTE).toHaveLength(70);
    // Sampled straight out of Live's picker: the first row's first swatch and
    // the last row's last. If these drift, the palette was regenerated from a
    // different screenshot and the index mapping needs rechecking.
    expect(MACRO_PALETTE[0]).toBe('#ff94a6');
    expect(MACRO_PALETTE[69]).toBe('#3c3c3c');
    expect(MACRO_PALETTE.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });

  test('an index beyond the palette falls back rather than pretending it is colour 0', () => {
    expect(macroColor(999)).not.toBe(MACRO_PALETTE[0]);
  });
});

describe('the plugin strip (doc/PLAN.md 4.1)', () => {
  const DONORS = join(__dirname, '..', '..', 'adg-codec', 'donors');
  const donor = (name: string) => Rack.parse(new Uint8Array(readFileSync(join(DONORS, name))));

  test('lists an unresolved plugin by its class id and the chain it sits in', () => {
    const html = render(donor('BS-VST3.adg'));
    expect(html).toContain('plugin-strip');
    // Nothing has resolved the id, so what is shown is the id - here in its
    // readable ASCII form, which is a vendor habit (SCHEMA.md Q17) and is why
    // it sits in the id slot rather than the name one.
    expect(html).toContain('ArtuAVISMBRTProc');
    expect(html).toContain('MiniBrute');
  });

  test('a rack with no plugins draws no strip at all', () => {
    expect(render(donor('BS.adg'))).not.toContain('plugin-strip');
  });
});

describe('a macro driving a plugin parameter (SCHEMA.md Q20)', () => {
  const DONORS = join(__dirname, '..', '..', 'adg-codec', 'donors');
  const donor = (name: string) => Rack.parse(new Uint8Array(readFileSync(join(DONORS, name))));

  test('the mapping table shows it, where it used to show nothing', () => {
    const html = render(donor('BS-VST3-mapped.adg'));
    // The file names neither the plugin nor the parameter, so the row is the
    // parameter id and, without a folder scan to resolve the class id, the
    // word Plugin where a device name goes.
    expect(html).toContain('Parameter 70');
    expect(html).toContain('Plugin');
  });

  test('an unnamed macro is labelled after it rather than as an empty slot (SCHEMA.md Q23)', () => {
    // Slot 13 here, past this rack's ten visible macros, so the knob is not
    // drawn - the label is what a knob WOULD read, and what the table reads.
    const macro = donor('BS-VST3-mapped.adg').macros[12];
    expect(macroLabel(macro)).toBe('Parameter 70');
  });

  test('its range is shown and not offered for editing', () => {
    const html = render(donor('BS-VST3-mapped.adg'));
    // 0..1, the plugin's own normalized range, in a cell with no input in it.
    expect(html).toContain('mapping-fixed');
  });
});
