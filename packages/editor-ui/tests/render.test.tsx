/**
 * Render tests for the recursive rack rendering (UI-PLAN Part 2.6). These use
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

  test('renders a nested rack as a rack, with its own header and macro bank', () => {
    const html = render(Rack.parse(buildFixtureBytes()));
    expect(html).toContain('Nested Rack');
    // Two rack panels: the root, and the nested one one level down.
    expect(html.match(/class="rack-panel/g) ?? []).toHaveLength(2);
    expect(html).toContain('depth-1');
  });
});

describe('drum racks', () => {
  test('renders pads rather than a plain chain list', () => {
    const html = render(Rack.parse(buildDrumFixtureBytes()));
    expect(html).toContain('drum-pads');
    expect(html).toContain('Kick');
    expect(html).toContain('Snare');
  });

  test('orders pads by note, not by document order', () => {
    // The fixture stores them 40, 36, 38 on purpose.
    const html = render(Rack.parse(buildDrumFixtureBytes()));
    const order = [...html.matchAll(/class="pad-name"[^>]*>([^<]+)</g)].map((m) => m[1]);
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
    const order = [...html.matchAll(/class="pad-name"[^>]*>([^<]+)</g)].map((m) => m[1]);
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
    expect(html).not.toContain('drum-pads');
  });
});
