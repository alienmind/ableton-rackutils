/**
 * Drives the components the way a user does - real DOM events on real
 * elements - because the render tests only ever proved markup comes out.
 * Every interaction in the first cut of this UI was broken and every render
 * test still passed.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Rack } from '@rackutils/adg-codec';
import { RackEditor } from '../src/RackEditor';
import { buildFixtureBytes } from '../../adg-codec/tests/fixture';

let container: HTMLDivElement;
let root: Root;
let rack: Rack;

function mount() {
  rack = Rack.parse(buildFixtureBytes());
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const render = (r: Rack) =>
    act(() => {
      root.render(
        <RackEditor
          rack={r}
          onChange={(next) => {
            rack = next;
            render(next);
          }}
        />,
      );
    });
  render(rack);
}

beforeEach(mount);
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

/**
 * Pointer drag, the way `useMacroDrag` implements it: press on a knob's dial,
 * move, release over another knob. The drop target is resolved with
 * `elementFromPoint`, which jsdom does not implement, so it is stubbed to
 * return the element the gesture is aimed at.
 */
function dragBetween(fromIndex: number, toIndex: number, shiftKey = false) {
  const dial = container.querySelectorAll('.macro-knob-dial')[fromIndex];
  const target = container.querySelectorAll('.macro-knob')[toIndex];
  const original = document.elementFromPoint;
  document.elementFromPoint = () => target as Element;
  try {
    act(() => dial.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, shiftKey, clientX: 0, clientY: 0 })));
    act(() => window.dispatchEvent(Object.assign(new Event('pointermove'), { shiftKey, clientX: 10, clientY: 0 })));
    act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { shiftKey, clientX: 10, clientY: 0 })));
  } finally {
    document.elementFromPoint = original;
  }
}

const knobName = (i: number) => container.querySelectorAll('.macro-knob .macro-knob-name')[i]?.textContent;

describe('macro drag and drop', () => {
  test('dropping a knob on another reorders the macro', () => {
    // Macro 1 drives ParamA and ParamC in the fixture; macro 3 is empty.
    expect(rack.macros[0].bindings).toHaveLength(2);
    dragBetween(0, 2);
    expect(rack.macros[2].bindings).toHaveLength(2);
    expect(rack.macros[0].bindings).toHaveLength(0);
  });

  test('shift-dropping swaps the two slots instead', () => {
    const nameBefore = knobName(2);
    dragBetween(0, 2, true);
    expect(rack.macros[2].bindings).toHaveLength(2);
    expect(knobName(0)).toBe(nameBefore);
  });

  test('dropping onto an empty slot works too', () => {
    dragBetween(0, 6);
    expect(rack.macros[6].bindings).toHaveLength(2);
  });
});

describe('clicking things', () => {
  test('the x on a mapped target unbinds that one target', () => {
    const unbind = container.querySelector('.macro-knob-targets .unbind')!;
    expect(unbind).toBeTruthy();
    click(unbind);
    expect(rack.macros[0].bindings).toHaveLength(1);
  });

  test('picking a colour recolours the macro', () => {
    click(container.querySelector('.macro-knob-swatch')!);
    const swatches = container.querySelectorAll('.color-picker .color-swatch');
    expect(swatches.length).toBeGreaterThan(4);
    click(swatches[5]);
    expect(rack.macros[0].color).toBe(5);
  });

  test('arming a parameter then clicking a knob binds it', () => {
    // ParamB is unmapped, so it lives behind "more" until that is expanded.
    click(container.querySelector('.more-toggle')!);
    const paramB = [...container.querySelectorAll('.param')].find((p) => p.textContent === 'ParamB');
    expect(paramB).toBeTruthy();
    click(paramB!);
    click(container.querySelectorAll('.macro-knob-dial')[3]);
    expect(rack.macros[3].bindings.map((b) => b.targetName)).toEqual(['ParamB']);
  });
});
