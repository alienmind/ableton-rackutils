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
    // 8 visible macros out of the 16 slots that always exist (SCHEMA.md Q7),
    // twice over: the nested rack draws its own bank too, and the first level
    // of nesting is open by default.
    expect(html.match(/class="macro-knob /g) ?? []).toHaveLength(16);
    expect(html).toContain('ParamA');
    expect(html).toContain('ParamC');
    expect(html).toContain('M1'); // the macro badge on a mapped parameter
  });

  test('splits a device into mapped rows and a collapsed "more"', () => {
    const html = render(Rack.parse(buildFixtureBytes()));
    // ParamB is unmapped, so it hides behind "more" until expanded.
    expect(html).toContain('more (1)');
    expect(html).toContain('mapped-params');
  });

  test('renders a nested rack as a rack, flat in the same row as its parent', () => {
    const html = render(Rack.parse(buildFixtureBytes()));
    expect(html).toContain('Nested Rack');
    // Two rack control panels, the root's and the nested one's, as SIBLINGS -
    // a nested rack rendered inside its parent is what used to cascade the
    // layout downward and force scrollbars.
    expect(html.match(/class="panel rack-panel/g) ?? []).toHaveLength(2);
    expect(html).toContain('depth-1');
    // Boundary markers say which panels belong to which rack, one pair each.
    expect(html.match(/rack-boundary start/g) ?? []).toHaveLength(2);
    expect(html.match(/rack-boundary end/g) ?? []).toHaveLength(2);
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
  test('renders the whole nesting: Fx rack, nested drum rack, named pads', () => {
    const html = render(Rack.parse(loadReal('drum-pads.adg')));
    expect(html).toContain('AlienMind Fx Rack');
    expect(html).toContain('AlienMind Fx Drum Rack');
    expect(html).toContain('Drum Rack'); // the kind badge on the nested panel
    for (const pad of ['Riser Faze', 'Riser Moog', 'Riser + Decay']) expect(html).toContain(pad);
  });

  test('pads come out in ascending note order, reversing the file order', () => {
    const html = render(Rack.parse(loadReal('drum-pads.adg')));
    const order = [...html.matchAll(/class="chain-note">[^<]*<\/span><span class="chain-row-name">([^<]+)</g)].map((m) => m[1]);
    expect(order).toEqual(['Riser + Decay', 'Riser Moog', 'Riser Faze']);
  });

  test('shows the real mappings on the macros that own them', () => {
    const html = render(Rack.parse(loadReal('drum-pads.adg')));
    expect(html).toContain('FX Reverb Decay');
    expect(html).toContain('DecayTime');
    expect(html).toContain('Gain');
  });

  test('native device parameters reach the UI (SCHEMA.md Q11 regression, in the UI layer)', () => {
    // The Q11 bug would render every native device as "no bindable parameters".
    const html = render(Rack.parse(loadReal('drum-pads.adg')));
    expect(html).not.toContain('no bindable parameters');
    expect(html).toContain('more (');
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
