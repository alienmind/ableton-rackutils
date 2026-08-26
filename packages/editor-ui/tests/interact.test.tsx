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

beforeEach(() => {
  // The contract strip restores its convention from localStorage, so a test
  // starts from a stored one unless it is cleared BEFORE the strip mounts.
  window.localStorage.clear();
  mount();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

/** Devices render collapsed to a title strip; open the first one to reach its parameters. */
const openFirstDevice = () => click(container.querySelector('.device-panel.collapsed .device-title-strip')!);

/** Binding is modal: nothing on a parameter does anything until Map is on (`context.tsx`). */
const turnMapOn = () => click(container.querySelector('.map-button')!);

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
  test('the x in the mapping table unbinds that one target', () => {
    // The knob no longer lists what it drives - a macro can drive any number
    // of parameters and naming them in a 58px knob pushed the grid apart. The
    // table carries the list and the unbind control with it.
    expect(container.querySelector('.macro-knob-targets')).toBeNull();
    // Macro 1 drives two parameters, so its row is collapsed until opened.
    click(container.querySelector('.mapping-expand-all')!);
    const unbind = container.querySelector('.mapping-unbind')!;
    expect(unbind).toBeTruthy();
    click(unbind);
    expect(rack.macros[0].bindings).toHaveLength(1);
  });

  test('picking a colour recolours the macro', () => {
    click(container.querySelector('.macro-knob-swatch')!);
    // The picker is portalled to the body: every panel clips its overflow, so
    // a popover rendered inline came out sliced in half.
    const swatches = document.body.querySelectorAll('.color-picker .color-swatch');
    expect(swatches.length).toBeGreaterThan(4);
    click(swatches[5]);
    expect(rack.macros[0].color).toBe(5);
  });

  test('arming a parameter then clicking a knob binds it', () => {
    // ParamB is unmapped, so it lives behind "more" until that is expanded.
    turnMapOn();
    openFirstDevice();
    click(container.querySelector('.more-toggle')!);
    const paramB = [...container.querySelectorAll('.param')].find((p) => p.textContent === 'ParamB');
    expect(paramB).toBeTruthy();
    click(paramB!);
    click(container.querySelectorAll('.macro-knob-dial')[3]);
    expect(rack.macros[3].bindings.map((b) => b.targetName)).toEqual(['ParamB']);
  });
});

describe('dragging a parameter onto a knob', () => {
  /** Press on a parameter, move, release over a macro knob. Same pointer approach as the knob drag. */
  function dragParamToKnob(param: Element, knobIndex: number) {
    const knob = container.querySelectorAll('.macro-knob')[knobIndex];
    const original = document.elementFromPoint;
    document.elementFromPoint = () => knob as Element;
    try {
      act(() => param.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, clientX: 0, clientY: 0 })));
      act(() => window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 60, clientY: 0 })));
      act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 60, clientY: 0 })));
    } finally {
      document.elementFromPoint = original;
    }
  }

  test('binds it, without needing the arm step', () => {
    turnMapOn();
    openFirstDevice();
    click(container.querySelector('.more-toggle')!);
    const paramB = [...container.querySelectorAll('.param')].find((p) => p.textContent === 'ParamB')!;
    dragParamToKnob(paramB, 4);
    expect(rack.macros[4].bindings.map((b) => b.targetName)).toEqual(['ParamB']);
  });

  test('a drag does not also arm the parameter it started from', () => {
    // Both gestures start with a press on the same button, so the click
    // handler has to tell them apart or every drag would leave something armed.
    turnMapOn();
    openFirstDevice();
    click(container.querySelector('.more-toggle')!);
    const paramB = [...container.querySelectorAll('.param')].find((p) => p.textContent === 'ParamB')!;
    dragParamToKnob(paramB, 4);
    expect(container.querySelector('.armed-note')).toBeNull();
  });

  test('refuses a drop onto another rack knob (SCHEMA.md Q2)', () => {
    // The nested rack's knobs carry a different data-rack-path. A KeyMidi
    // belongs to the nearest enclosing rack, so this mapping cannot exist.
    turnMapOn();
    openFirstDevice();
    click(container.querySelector('.more-toggle')!);
    const paramB = [...container.querySelectorAll('.param')].find((p) => p.textContent === 'ParamB')!;
    // The nested rack starts collapsed to a strip; open it so it has knobs.
    click(container.querySelector('.rack-panel.collapsed .rack-strip')!);
    const nestedKnobs = container.querySelectorAll('.macro-bank-wrap[data-rack-path]:not([data-rack-path=""]) .macro-knob');
    expect(nestedKnobs.length).toBeGreaterThan(0);

    const original = document.elementFromPoint;
    document.elementFromPoint = () => nestedKnobs[0];
    try {
      act(() => paramB.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, clientX: 0, clientY: 0 })));
      act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 60, clientY: 0 })));
    } finally {
      document.elementFromPoint = original;
    }
    // Nothing bound anywhere: not in the nested rack, not in the outer one.
    expect(rack.subRack(rack.chains[0].devices[1].path)!.macros[0].bindings.map((b) => b.targetName)).toEqual(['InnerParam']);
  });
});

describe('chain colours (SCHEMA.md Q13)', () => {
  test('a chain with a colour index gets a stripe', () => {
    const row = container.querySelector('.chain-row') as HTMLElement;
    expect(row.style.getPropertyValue('--chain-color')).toMatch(/^#/);
  });
});

describe('Map mode (doc/PLAN.md 4.4)', () => {
  test('a parameter drag does nothing until Map is on', () => {
    openFirstDevice();
    click(container.querySelector('.more-toggle')!);
    const paramB = [...container.querySelectorAll('.param')].find((p) => p.textContent === 'ParamB')!;

    const knob = container.querySelectorAll('.macro-knob')[4];
    const original = document.elementFromPoint;
    document.elementFromPoint = () => knob;
    try {
      act(() => paramB.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, clientX: 0, clientY: 0 })));
      act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 60, clientY: 0 })));
    } finally {
      document.elementFromPoint = original;
    }
    expect(rack.macros[4].bindings).toHaveLength(0);
  });

  test('a knob drag maps a nested rack macro onto the parent instead of moving it', () => {
    turnMapOn();
    click(container.querySelector('.rack-panel.collapsed .rack-strip')!);
    const nestedDial = container.querySelector('.macro-bank-wrap[data-rack-path]:not([data-rack-path=""]) .macro-knob-dial')!;
    const outerKnob = container.querySelectorAll('.macro-bank-wrap[data-rack-path=""] .macro-knob')[5];

    const original = document.elementFromPoint;
    document.elementFromPoint = () => outerKnob;
    try {
      act(() => nestedDial.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, clientX: 0, clientY: 0 })));
      act(() => window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 60, clientY: 0 })));
      act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 60, clientY: 0 })));
    } finally {
      document.elementFromPoint = original;
    }

    // The parent now drives the child's macro 1, and the child keeps its own
    // mapping: this is a binding on MacroControls.0, not a macro move
    // (SCHEMA.md Q22).
    // The target reads as the child knob's own label, not as MacroControls.0.
    expect(rack.macros[5].bindings.map((b) => b.targetName)).toEqual(['Macro 1']);
  });

  test('leaving Map mode takes the cables away', () => {
    turnMapOn();
    expect(container.querySelector('.map-button')!.textContent).toBe('Unmap');
    turnMapOn();
    expect(container.querySelector('.map-button')!.textContent).toBe('Map');
  });
});

describe('rack features, the contract strip (doc/PLAN.md 4.3.1)', () => {
  const columns = () => [...container.querySelectorAll('.contract-column')];
  const arrow = (which: 'in' | 'out') => container.querySelectorAll('.contract-arrows button')[which === 'in' ? 0 : 1] as HTMLElement;

  /** Pick it on the left, then press the arrow: the two-column gesture. */
  const addFeature = (label: string) => {
    const entry = [...columns()[0].querySelectorAll('.contract-entry')].find((el) => el.textContent?.includes(label))!;
    act(() => (entry as HTMLElement).click());
    act(() => arrow('in').click());
  };

  /** Pick it on the right, then press the other arrow. */
  const removeFeature = (label: string) => {
    const entry = [...columns()[1].querySelectorAll('.contract-entry')].find((el) => el.textContent?.includes(label))!;
    act(() => (entry as HTMLElement).click());
    act(() => arrow('out').click());
  };

  const addedLabels = () => [...columns()[1].querySelectorAll('.contract-entry-name')].map((el) => el.textContent);

  const setCode = (code: string) => {
    const input = container.querySelector('.contract-code') as HTMLInputElement;
    act(() => {
      input.value = code;
      // React delegates onBlur through focusout, which is the event that
      // bubbles; a plain blur event never reaches it.
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  };

  test('ticking an option adds the device, the macro and the code', () => {
    setCode('BS');
    addFeature('Auto Filter');

    // Leading slot, one binding per chain, and the code on the rack itself.
    expect(rack.name).toBe('BS');
    expect(rack.macros[0].name).toBe('BS FILTER');
    expect(rack.macros[0].bindings).toHaveLength(rack.chains.length);
    expect(rack.chains.every((c) => c.devices.some((d) => d.type === 'AutoFilter2'))).toBe(true);
  });

  test('unticking it takes the device and the slot back off', () => {
    setCode('BS');
    const before = { count: rack.macroCount, names: rack.macros.map((m) => m.name) };
    addFeature('Auto Filter');
    removeFeature('BS FILTER');

    expect(rack.macroCount).toBe(before.count);
    expect(rack.macros.map((m) => m.name)).toEqual(before.names);
    expect(rack.chains.some((c) => c.devices.some((d) => d.type === 'AutoFilter2'))).toBe(false);
  });

  test('the knobs land in the order of the list', () => {
    setCode('BS');
    addFeature('Auto Filter');
    addFeature('Utility Gain');

    // The list is the template's order, and the template's order is the
    // convention: whatever the rack, these two knobs land this way round.
    expect(addedLabels()).toEqual(['BS FILTER', 'BS GAIN']);
    expect(rack.macros.slice(0, 2).map((m) => m.name)).toEqual(['BS FILTER', 'BS GAIN']);
  });

  test('dragging a feature up the list moves its knob left', () => {
    setCode('BS');
    addFeature('Auto Filter');
    addFeature('Utility Gain');

    const rows = [...columns()[1].querySelectorAll('li[data-feature-index]')];
    const grip = rows[1].querySelector('.contract-grip')!;
    // jsdom gives every element a zero box, so the drop target is resolved by
    // the row under the pointer - stub the boxes the way the real ones sit.
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: i * 20, bottom: i * 20 + 20 }) as DOMRect;
    });

    act(() => grip.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, clientY: 20 })));
    act(() => window.dispatchEvent(Object.assign(new Event('pointermove'), { clientY: 5 })));
    act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { clientY: 5 })));

    expect(addedLabels()).toEqual(['BS GAIN', 'BS FILTER']);
    expect(rack.macros.slice(0, 2).map((m) => m.name)).toEqual(['BS GAIN', 'BS FILTER']);
  });

  test('the template survives a remount, and the rack name does not travel with it', () => {
    setCode('BS');
    addFeature('Utility Gain');

    act(() => root.unmount());
    container.remove();
    mount(); // a fresh rack, called Test Rack again

    // The feature is still in the template. Its label reads the NEW rack's
    // name, because the name belongs to the rack and the template does not.
    expect(addedLabels()).toEqual(['Test Rack GAIN']);
  });

  test('the settings column belongs to the feature just added', () => {
    setCode('BS');
    addFeature('Utility Gain');

    const settings = container.querySelector('.contract-settings')!;
    expect(settings.querySelector('h4')!.textContent).toBe('Utility Gain');
    expect((settings.querySelector('.contract-pattern') as HTMLInputElement).value).toBe('{name} GAIN');
    // Bass mono is this feature's own setting, and it is two real parameters
    // on StereoGain rather than a knob.
    expect(settings.textContent).toContain('Bass mono');
  });

  test('a settings checkbox writes into the device it belongs to', () => {
    setCode('BS');
    addFeature('Utility Gain');
    const box = container.querySelector('.contract-settings .contract-setting input') as HTMLInputElement;
    act(() => box.click());

    const utility = rack.chains[0].devices.find((d) => d.type === 'StereoGain')!;
    const el = rack.resolveTarget(utility.path)!;
    const bassMono = el.getElementsByTagName('BassMono')[0].getElementsByTagName('Manual')[0];
    expect(bassMono.getAttribute('Value')).toBe('true');
  });
});

describe('a feature with several knobs (EQ Three)', () => {
  const columns = () => [...container.querySelectorAll('.contract-column')];
  const addFeature = (label: string) => {
    const entry = [...columns()[0].querySelectorAll('.contract-entry')].find((el) => el.textContent?.includes(label))!;
    act(() => (entry as HTMLElement).click());
    act(() => (container.querySelectorAll('.contract-arrows button')[0] as HTMLElement).click());
  };
  const setCode = (code: string) => {
    const input = container.querySelector('.contract-code') as HTMLInputElement;
    act(() => {
      input.value = code;
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  };

  test('is ONE entry in the list and three knobs on the rack', () => {
    setCode('BS');
    // One EQ Three, not three EQ features: it is one device carrying three
    // band gains, and adding it three times would insert three EQs.
    expect([...columns()[0].querySelectorAll('.contract-entry-name')].map((el) => el.textContent)).toContain('EQ Three');
    addFeature('EQ Three');

    expect([...columns()[1].querySelectorAll('.contract-entry-name')].map((el) => el.textContent)).toEqual(['BS EQ (Lo, Mid, Hi)']);
    expect(rack.macros.slice(0, 3).map((m) => m.name)).toEqual(['BS LO', 'BS MID', 'BS HI']);
    // One EQ per chain, shared by the three knobs.
    for (const chain of rack.chains) {
      expect(chain.devices.filter((d) => d.type === 'FilterEQ3')).toHaveLength(1);
    }
  });

  test('a band can be dropped on its own, and the device stays', () => {
    setCode('BS');
    addFeature('EQ Three');
    const mid = [...container.querySelectorAll('.contract-band')].find((el) => el.textContent?.includes('Mid'))!;
    act(() => (mid.querySelector('input[type="checkbox"]') as HTMLInputElement).click());

    expect(rack.macros.slice(0, 2).map((m) => m.name)).toEqual(['BS LO', 'BS HI']);
    expect(rack.macros.some((m) => m.name === 'BS MID')).toBe(false);
    expect(rack.chains.every((c) => c.devices.some((d) => d.type === 'FilterEQ3'))).toBe(true);
  });

  test('taking the feature out takes all three knobs and the device with it', () => {
    setCode('BS');
    const before = { count: rack.macroCount, names: rack.macros.map((m) => m.name) };
    addFeature('EQ Three');

    const entry = [...columns()[1].querySelectorAll('.contract-entry')][0] as HTMLElement;
    act(() => entry.click());
    act(() => (container.querySelectorAll('.contract-arrows button')[1] as HTMLElement).click());

    expect(rack.macroCount).toBe(before.count);
    expect(rack.macros.map((m) => m.name)).toEqual(before.names);
    expect(rack.chains.some((c) => c.devices.some((d) => d.type === 'FilterEQ3'))).toBe(false);
  });
});

describe('chain colour (SCHEMA.md Q13)', () => {
  test('picking a chain colour paints the row and the macros that only drive it', () => {
    const chainSwatch = container.querySelector('.chain-swatch') as HTMLElement;
    act(() => chainSwatch.click());
    const swatches = [...document.querySelectorAll('.color-swatch')] as HTMLElement[];
    act(() => swatches[21].click());

    expect(rack.chains[0].colorIndex).toBe(21);
    // Macro 1 drives two parameters, both inside that chain, so it takes the
    // chain's colour. A macro reaching outside it would not.
    expect(rack.macros[0].color).toBe(21);

    const row = container.querySelector('.chain-row') as HTMLElement;
    expect(row.style.getPropertyValue('--chain-color')).not.toBe('');
    expect(row.style.getPropertyValue('--chain-ink')).not.toBe('');
  });
});

describe('dropping a parameter back where it already is', () => {
  test('changes nothing and draws no second cable', () => {
    // Map mode already draws this binding's cable; a connect animation on top
    // of it put two lines into one knob.
    click(container.querySelector('.map-button')!);
    click(container.querySelector('.device-panel.collapsed .device-title-strip')!);
    const param = [...container.querySelectorAll('.param')].find((p) => p.textContent === 'ParamA')!;
    const before = rack.macros[0].bindings.map((b) => b.targetName).sort();

    const knob = container.querySelectorAll('.macro-knob')[0];
    const original = document.elementFromPoint;
    document.elementFromPoint = () => knob;
    try {
      act(() => param.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, clientX: 0, clientY: 0 })));
      act(() => window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 60, clientY: 0 })));
      act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 60, clientY: 0 })));
    } finally {
      document.elementFromPoint = original;
    }

    expect(rack.macros[0].bindings.map((b) => b.targetName).sort()).toEqual(before);
    // No echo: the drag cable is gone the moment the pointer comes up.
    expect(container.querySelector('.patch-cable')).toBeNull();
  });
});
