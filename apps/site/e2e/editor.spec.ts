import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeRackFile } from './rack-file';

async function loadRack(page: Page, kind: 'instrument' | 'drum' = 'instrument') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.setInputFiles('input[type=file]', writeRackFile(kind));
  await page.waitForSelector('.macro-knob');
  return errors;
}

/**
 * Scoped to the ROOT rack. The fixtures nest a rack inside the rack, and a
 * nested rack renders its own macro bank and chain rows - an unscoped
 * `.macro-knob` matches both racks' knobs and the assertions become nonsense.
 */
// The ROOT rack's own control panel. Every rack's panel is now a sibling in
// `.rack-row` rather than nested inside its parent, so "the root" is the first
// rack panel in the row, not the outermost element.
const rootPanel = (page: Page) => page.locator('.rack-row > .panel.rack-panel').first();
const rootBody = (page: Page) => rootPanel(page).locator('> .rack-body');
const rootKnobs = (page: Page) => rootBody(page).locator('> .macro-bank-wrap .macro-knob');
const rootDials = (page: Page) => rootBody(page).locator('> .macro-bank-wrap .macro-knob-dial');
const rootChainRows = (page: Page) => rootBody(page).locator('> .chain-list .chain-row');
const macroNames = (page: Page) => rootKnobs(page).locator('.macro-knob-name').allTextContents();

/** Devices render as collapsed title strips; open the first to reach its parameters. */
async function openFirstDevice(page: Page) {
  await page.locator('.device-panel.collapsed .device-title-strip').first().click();
}

/**
 * Pointer drag, the gesture the UI actually uses - HTML5 drag-and-drop was the
 * first implementation and did nothing in a browser.
 *
 * Driven through `hover()` rather than `boundingBox()` arithmetic on purpose.
 * The page header is tall enough to push the editor below the fold, and
 * `mouse.move` to a coordinate outside the viewport quietly does nothing,
 * which is indistinguishable from a broken drag. `hover()` scrolls the element
 * into view first, so the test cannot fail for a reason the user never sees -
 * this exact trap passed locally and failed in CI at a different window size.
 */
async function dragBetween(page: Page, source: Locator, target: Locator, shift = false) {
  if (shift) await page.keyboard.down('Shift');
  await source.hover();
  await page.mouse.down();
  await target.hover();
  await target.hover(); // a second move, so the drag registers a hover on the target before release
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

const dragKnob = (page: Page, from: number, to: number, shift = false) =>
  dragBetween(page, rootDials(page).nth(from), rootDials(page).nth(to), shift);

test('loads a rack and renders its macros', async ({ page }) => {
  const errors = await loadRack(page);
  await expect(rootKnobs(page)).toHaveCount(8);
  await expect(page.locator('.rack-name').first()).toContainText('Test Rack');
  expect(errors).toEqual([]);
});

test('dragging a knob onto another moves the whole macro', async ({ page }) => {
  const errors = await loadRack(page);
  const before = await macroNames(page);
  await dragKnob(page, 0, 2);
  const after = await macroNames(page);
  expect(after[2]).toBe(before[0]);
  expect(after[0]).not.toBe(before[0]);
  expect(errors).toEqual([]);
});

test('shift-dropping swaps the two macros instead', async ({ page }) => {
  await loadRack(page);
  const before = await macroNames(page);
  await dragKnob(page, 0, 3, true);
  const after = await macroNames(page);
  expect(after[3]).toBe(before[0]);
  expect(after[0]).toBe(before[3]);
});

test('the x in the mapping table unbinds just that one target', async ({ page }) => {
  // The knob no longer names what it drives: the table does, and carries the
  // unbind control with it.
  await loadRack(page);
  await expect(page.locator('.macro-knob-targets')).toHaveCount(0);
  const targets = page.locator('.mapping-targets li');
  const before = await targets.count();
  expect(before).toBeGreaterThan(1);
  await page.locator('.mapping-unbind').first().click();
  await expect(targets).toHaveCount(before - 1);
});

test('picking a colour recolours the knob', async ({ page }) => {
  await loadRack(page);
  const knob = rootKnobs(page).first();
  const before = await knob.evaluate((el) => getComputedStyle(el).getPropertyValue('--macro-color'));
  await rootKnobs(page).locator('.macro-knob-swatch').first().scrollIntoViewIfNeeded();
  await rootKnobs(page).locator('.macro-knob-swatch').first().click();
  await page.locator('.color-picker .color-swatch').nth(6).click();
  await expect
    .poll(() => knob.evaluate((el) => getComputedStyle(el).getPropertyValue('--macro-color')))
    .not.toBe(before);
});

test('arming a parameter then clicking a knob binds it', async ({ page }) => {
  await loadRack(page);
  await openFirstDevice(page);
  await page.locator('.more-toggle').first().click();
  await page.locator('.param', { hasText: 'ParamB' }).first().click();
  await rootDials(page).nth(3).click();
  // Confirmed in the mapping table: the knob no longer names what it drives.
  await expect(page.locator('.mapping-rows > li', { hasText: 'Macro 4' }).locator('.mapping-param')).toContainText('ParamB');
});

test('macros are numbered across then down', async ({ page }) => {
  await loadRack(page);
  const slots = rootKnobs(page).locator('.macro-knob-slot');
  const rows = await slots.evaluateAll((els) => {
    const byRow: Record<number, string[]> = {};
    for (const el of els) {
      const y = Math.round(el.getBoundingClientRect().y);
      (byRow[y] ||= []).push(el.textContent ?? '');
    }
    return Object.keys(byRow)
      .map(Number)
      .sort((a, b) => a - b)
      .map((y) => byRow[y].join(' '));
  });
  expect(rows[0]).toBe('1 2 3 4');
  expect(rows[1]).toBe('5 6 7 8');
});

/**
 * The regression that matters most: SCHEMA.md Q12. Chrome's XMLSerializer
 * emits the XML declaration and jsdom's does not, so a codec that prepends one
 * unconditionally produces two in a browser - which fails to reparse, breaking
 * every edit, and would write a file Live rejects. Nothing running under jsdom
 * can catch this.
 */
test('a saved file has exactly one XML declaration and reparses', async ({ page }) => {
  await loadRack(page);
  await dragKnob(page, 0, 1); // edit first, so this is a mutated document
  const download = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a copy' }).click()]).then(
    ([d]) => d,
  );
  const path = await download.path();
  const xml = gunzipSync(readFileSync(path!)).toString('utf8');

  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml.split('<?xml')).toHaveLength(2);
  expect(xml).toContain('<GroupDevicePreset');
});

test('a drum rack renders pads and keeps the whole rack on one row', async ({ page }) => {
  await loadRack(page, 'drum');
  await expect(rootBody(page).locator('> .chain-list .pad-grid')).toBeVisible();
  // Pads are ordered by note; the fixture stores them 40, 36, 38 on purpose.
  await expect(rootChainRows(page).locator('.chain-row-name')).toHaveText(['Kick', 'Snare', 'Hat']);

  // The ROW may not grow. Panels inside it are allowed to scroll - a drum rack
  // can have 128 chains and they have to go somewhere - but the rack itself
  // stays one device row tall. The height invariant is asserted on its own
  // below; here it is enough that the page does not scroll vertically to
  // reach the rack.
  expect((await page.locator('.rack-row').boundingBox())!.height).toBeLessThanOrEqual(169 + 17 + 2);
});

test('dragging a parameter onto a knob binds it', async ({ page }) => {
  // The gesture people reach for first. Binding used to be click-to-arm then
  // click-a-knob, which is discoverable only if you read the instructions.
  await loadRack(page);
  await openFirstDevice(page);
  await page.locator('.more-toggle').first().click();

  const param = page.locator('.param', { hasText: 'ParamB' }).first();
  const knob = rootKnobs(page).nth(5);
  await dragBetween(page, param, knob);

  await expect(page.locator('.mapping-rows > li', { hasText: 'Macro 6' }).locator('.mapping-param')).toContainText('ParamB');
  // The drag must not also leave the parameter armed.
  await expect(page.locator('.armed-note')).toHaveCount(0);
});

test('chain rows carry a colour stripe', async ({ page }) => {
  await loadRack(page, 'drum');
  const stripe = await rootChainRows(page)
    .first()
    .evaluate((el) => getComputedStyle(el).borderLeftColor);
  expect(stripe).not.toBe('rgba(0, 0, 0, 0)');
});

/**
 * The 169px invariant. A Max for Live device view is 169px and does not
 * scroll, so a rack taller than one device row is unreachable there - this is
 * a hard constraint, not a preference. It has regressed twice: once from
 * stacking every chain's devices, once from letting a panel grow to fit its
 * content when the chain list was hidden, which made a 16-pad drum rack pages
 * tall.
 */
const ROW_HEIGHT = 169 + 17; // device row + title bar

test('a rack stays one device row tall, whatever the side buttons do', async ({ page }) => {
  await loadRack(page, 'drum');
  const row = page.locator('.rack-row');
  const height = async () => (await row.boundingBox())!.height;

  expect(await height()).toBeLessThanOrEqual(ROW_HEIGHT + 2);

  // Every side button, in turn. None may grow the row.
  for (const title of [
    'Show/hide macro controls',
    'Show/hide Macro Variations',
    'Collapse the devices in this rack',
    'Show/hide chains',
  ]) {
    await page.locator(`.rack-side .side-btn[title="${title}"]`).first().click();
    expect(await height(), `after "${title}"`).toBeLessThanOrEqual(ROW_HEIGHT + 2);
  }
});

test('undo and redo live on the root title bar and span every rack level', async ({ page }) => {
  await loadRack(page);
  const undo = page.locator('.history-buttons button').first();
  const redo = page.locator('.history-buttons button').nth(1);
  // Only the root rack has them, even though the fixture nests a rack.
  await expect(page.locator('.history-buttons')).toHaveCount(1);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  const before = await macroNames(page);
  await dragKnob(page, 0, 2);
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect.poll(async () => (await macroNames(page))[0]).toBe(before[0]);
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect.poll(async () => (await macroNames(page))[2]).toBe(before[0]);
});

test('the macro count control is gone from the title bar', async ({ page }) => {
  // It moved to the rack's left-hand column, where Live has it. One control in
  // two places is one too many.
  await loadRack(page);
  await expect(page.locator('.macro-count')).toHaveCount(0);
  await expect(page.locator('.rack-side .side-btn[title="Add two macros"]').first()).toBeVisible();
});

test('a patch cable hangs from the parameter while dragging, and lands on the knob', async ({ page }) => {
  await loadRack(page);
  await openFirstDevice(page);
  await page.locator('.more-toggle').first().click();
  const param = page.locator('.param', { hasText: 'ParamB' }).first();
  const knob = rootKnobs(page).nth(5);

  await expect(page.locator('.patch-cable')).toHaveCount(0);

  await param.hover();
  await page.mouse.down();
  await knob.hover();
  // Mid-drag: a cable exists, it sags (the path's control points sit below its
  // ends), and it reads as a valid target.
  const cable = page.locator('.patch-cable');
  await expect(cable).toHaveCount(1);
  // The sag is a damped spring starting at rest, so it needs a few frames
  // before the curve differs from a straight line. Poll rather than sample
  // once and hope.
  await expect
    .poll(async () => {
      const d = (await cable.getAttribute('d')) ?? '';
      const m = d.match(/M [\d.-]+ ([\d.-]+) C [\d.-]+ ([\d.-]+)/);
      return m ? Number(m[2]) - Number(m[1]) : 0;
    }, { timeout: 3000 })
    .toBeGreaterThan(1); // hanging, not a straight line
  await expect(cable).toHaveClass(/will-connect/);
  // Over a knob, the cable takes that macro's colour rather than a generic one.
  // Both read through getComputedStyle: the browser normalises an inline hex
  // to rgb(), so comparing the raw custom property against it never matches.
  const knobColour = await knob.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(el).getPropertyValue('--macro-color').trim();
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  });
  expect(await cable.evaluate((el) => getComputedStyle(el).stroke)).toBe(knobColour);

  await page.mouse.up();
  await expect(page.locator('.mapping-rows > li', { hasText: 'Macro 6' }).locator('.mapping-param')).toContainText('ParamB');
  // The cable settles and then takes itself off screen.
  await expect(page.locator('.patch-cable')).toHaveCount(0, { timeout: 4000 });
});

test('a cable dropped on nothing retracts and binds nothing', async ({ page }) => {
  await loadRack(page);
  await openFirstDevice(page);
  await page.locator('.more-toggle').first().click();
  const param = page.locator('.param', { hasText: 'ParamB' }).first();
  const before = await page.locator('.mapping-targets li').count();

  await param.hover();
  await page.mouse.down();
  await page.locator('.rack-kind').first().hover(); // not a knob
  await expect(page.locator('.patch-cable')).toHaveCount(1);
  await page.mouse.up();

  await expect(page.locator('.patch-cable')).toHaveCount(0, { timeout: 4000 });
  expect(await page.locator('.mapping-targets li').count()).toBe(before);
});

test('a mapped parameter wears the colour of the macro driving it', async ({ page }) => {
  await loadRack(page);
  // Recolour macro 1, then check the parameter it drives followed it. A fixed
  // green says "mapped" and nothing more; a rack has up to 16 macros.
  const knob = rootKnobs(page).first();
  await knob.locator('.macro-knob-swatch').scrollIntoViewIfNeeded();
  await knob.locator('.macro-knob-swatch').click();
  await page.locator('.color-picker .color-swatch').nth(9).click();

  const knobColour = await knob.evaluate((el) => getComputedStyle(el).getPropertyValue('--macro-color').trim());
  // Devices start collapsed, so open one to see its parameter chips.
  await openFirstDevice(page);
  const chip = page.locator('.mapped-params .param').first();
  const chipColour = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);

  const asRgb = await page.evaluate((hex) => {
    const probe = document.createElement('span');
    probe.style.color = hex;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, knobColour);

  expect(chipColour).toBe(asRgb);
});

test('every rack sits in one flat row, nested racks included', async ({ page }) => {
  // The structural fix: a nested rack is a SIBLING panel, not a child. When it
  // was a child its title bar started below its parent's, racks cascaded
  // downward, and depth was bounded by how many fit vertically.
  await loadRack(page);
  const tops = await page.locator('.rack-row > .panel').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops.length).toBeGreaterThan(1);
  expect(new Set(tops).size).toBe(1);

  // The nested rack is present as a collapsed strip, in the same row.
  await expect(page.locator('.rack-row > .panel.rack-panel.collapsed')).toHaveCount(1);
  await expect(page.locator('.rack-boundary.start')).toHaveCount(1);
});

test('the mapping table lists rack, macro, device and parameter', async ({ page }) => {
  await loadRack(page);
  const row = page.locator('.mapping-rows > li').first();
  await expect(row.locator('.mapping-rack')).toContainText('Test Rack');
  await expect(row.locator('.mapping-macro')).toContainText('Macro 1');
  // The fixture's macro 1 drives two parameters; they stack under it.
  await expect(row.locator('.mapping-targets li')).toHaveCount(2);
  await expect(row.locator('.mapping-device').first()).toContainText('TestSynth');
  await expect(row.locator('.mapping-param').first()).toContainText('Param');
});

test('devices and nested racks start collapsed', async ({ page }) => {
  // A chain opened flat is a wall of parameter lists, and every nested rack
  // opening itself pushed the rack you came to look at off the screen.
  await loadRack(page);
  await expect(page.locator('.device-panel.collapsed')).not.toHaveCount(0);
  await expect(page.locator('.rack-panel.collapsed')).not.toHaveCount(0);
  // Opening one is a click on its strip.
  await openFirstDevice(page);
  await expect(page.locator('.device-panel').first()).not.toHaveClass(/collapsed/);
});

test('the unbind buttons line up on the right edge', async ({ page }) => {
  await loadRack(page);
  const rights = await page.locator('.mapping-unbind').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  expect(rights.length).toBeGreaterThan(1);
  expect(new Set(rights).size).toBe(1);
});
