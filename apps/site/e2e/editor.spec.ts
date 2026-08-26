import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeRackFile } from './rack-file';

async function loadRack(page: Page, kind: 'instrument' | 'drum' | 'plugin' | 'plugin-mapped' | 'handmade' = 'instrument') {
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

/**
 * One mapping row, by macro slot. Not by the macro's label: an unnamed macro
 * is labelled after what it drives (SCHEMA.md Q23), so the label changes the
 * moment the binding under test exists.
 */
const mappingRowForSlot = (page: Page, slot: number) =>
  page.locator('.mapping-grid tbody tr').filter({ has: page.locator(`.mapping-slot:text-is("${slot}")`) });

/** Binding is modal now: a parameter does nothing until Map mode is on (`context.tsx`). */
async function turnMapOn(page: Page) {
  await page.locator('.map-button').first().click();
}

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
  const targets = page.locator('.mapping-grid tbody tr');
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
  await turnMapOn(page);
  await openFirstDevice(page);
  await page.locator('.more-toggle').first().click();
  await page.locator('.param', { hasText: 'ParamB' }).first().click();
  await rootDials(page).nth(3).click();
  // Confirmed in the mapping table: the knob no longer names what it drives.
  await expect(mappingRowForSlot(page, 4).locator('.col-name')).toContainText('ParamB');
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
  const download = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .adg' }).click()]).then(
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
  await turnMapOn(page);
  await openFirstDevice(page);
  await page.locator('.more-toggle').first().click();

  const param = page.locator('.param', { hasText: 'ParamB' }).first();
  const knob = rootKnobs(page).nth(5);
  await dragBetween(page, param, knob);

  await expect(mappingRowForSlot(page, 6).locator('.col-name')).toContainText('ParamB');
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
  await turnMapOn(page);
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
  await expect(mappingRowForSlot(page, 6).locator('.col-name')).toContainText('ParamB');
  // The cable settles and then takes itself off screen.
  await expect(page.locator('.patch-cable')).toHaveCount(0, { timeout: 4000 });
});

test('a cable dropped on nothing retracts and binds nothing', async ({ page }) => {
  await loadRack(page);
  await turnMapOn(page);
  await openFirstDevice(page);
  await page.locator('.more-toggle').first().click();
  const param = page.locator('.param', { hasText: 'ParamB' }).first();
  const before = await page.locator('.mapping-grid tbody tr').count();

  await param.hover();
  await page.mouse.down();
  await page.locator('.rack-kind').first().hover(); // not a knob
  await expect(page.locator('.patch-cable')).toHaveCount(1);
  await page.mouse.up();

  await expect(page.locator('.patch-cable')).toHaveCount(0, { timeout: 4000 });
  expect(await page.locator('.mapping-grid tbody tr').count()).toBe(before);
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

test('the mapping table lists macro, path, name and range', async ({ page }) => {
  await loadRack(page);
  // A macro driving several parameters is one collapsed row until opened.
  await page.locator('.mapping-expand-all').click();
  // Scoped to the root rack: the nested rack has a Macro 1 of its own.
  const rows = page
    .locator('.mapping-grid tbody tr')
    .filter({ has: page.locator('.col-path', { hasText: 'Test Rack' }) })
    .filter({ has: page.locator('.mapping-slot:text-is("1")') });
  // The fixture's macro 1 drives two parameters, one row each, Live's layout.
  await expect(rows).toHaveCount(2);
  const row = rows.first();
  // Unnamed, so it is labelled after what it drives (SCHEMA.md Q23).
  await expect(row.locator('.col-macro')).toContainText('ParamA');
  await expect(row.locator('.col-path')).toContainText('Test Rack');
  await expect(row.locator('.col-path')).toContainText('TestSynth');
  await expect(row.locator('.col-name')).toContainText('Param');
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
  await page.locator('.mapping-expand-all').click();
  const rights = await page.locator('.mapping-unbind').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  expect(rights.length).toBeGreaterThan(1);
  expect(new Set(rights).size).toBe(1);
});

test('the mapping table edits a range and inverts it', async ({ page }) => {
  // Ranges have no UI in Live's own right-click menu (SCHEMA.md Q4), so this
  // table is the only place they can be authored. Browser-only because the
  // edit has to survive a real serialize/reparse cycle.
  await loadRack(page);
  // Macro 1 drives two parameters, so its rows live behind the summary.
  await page.locator('.mapping-expand-all').click();
  const row = page.locator('.mapping-grid tbody tr', { hasText: 'ParamA' }).first();
  const min = row.locator('.mapping-range').first();
  const max = row.locator('.mapping-range').nth(1);

  await min.fill('20');
  await min.press('Enter');
  await expect(min).toHaveValue('20');

  await row.locator('.mapping-invert').click();
  await expect(min).toHaveValue('100');
  await expect(max).toHaveValue('20');
  await expect(row.locator('.mapping-invert')).toHaveClass(/is-inverted/);
});

test('the row scrolls sideways when it is wider than the window', async ({ page }) => {
  // A rack wider than the window had no scrollbar and no hint that anything
  // was off to the right, until some panel toggled and forced a re-layout.
  await page.setViewportSize({ width: 420, height: 900 });
  await loadRack(page, 'drum');

  const scroller = page.locator('.rack-editor-scroll');
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeGreaterThan(0);
});

test('Map mode draws the existing cables, and leaving it takes them away', async ({ page }) => {
  await loadRack(page);
  await openFirstDevice(page);
  await expect(page.locator('.mapping-cable')).toHaveCount(0);

  await turnMapOn(page);
  // The fixture's macro 1 drives two parameters of this device, and both ends
  // are on screen, so both cables can be drawn.
  await expect(page.locator('.mapping-cable').first()).toBeVisible();

  await turnMapOn(page); // Unmap
  await expect(page.locator('.mapping-cable')).toHaveCount(0);
});

test('a rack feature goes in from the left and comes back out from the right', async ({ page }) => {
  await loadRack(page);
  await page.locator('.contract-code').fill('BS');
  await page.locator('.contract-code').press('Enter');

  const available = page.locator('.contract-column').nth(0);
  const inRack = page.locator('.contract-column').nth(1);
  await available.locator('.contract-entry', { hasText: 'Auto Filter' }).click();
  await page.locator('.contract-arrows button').first().click();

  // Leading slot, the rack name on the knob, and the feature now sits in the
  // right-hand list under its own label.
  await expect(rootKnobs(page).first().locator('.macro-knob-name')).toHaveText('BS FILTER');
  await expect(inRack.locator('.contract-entry-name')).toHaveText(['BS FILTER']);
  await expect(page.locator('.rack-name').first()).toHaveText('BS');
  // The settings column is the one that was just added.
  await expect(page.locator('.contract-settings h4')).toHaveText('Auto Filter');

  await inRack.locator('.contract-entry', { hasText: 'BS FILTER' }).click();
  await page.locator('.contract-arrows button').nth(1).click();
  await expect(inRack.locator('.contract-entry-name')).toHaveCount(0);
  await expect(rootKnobs(page).first().locator('.macro-knob-name')).not.toHaveText('BS FILTER');
});

test('a contract-authored rack saves as a file that reparses', async ({ page }) => {
  // The whole point of the strip: what it writes has to survive a round trip,
  // because the next thing that opens it is Live.
  await loadRack(page);
  await page.locator('.contract-code').fill('BS');
  await page.locator('.contract-code').press('Enter');
  await page.locator('.contract-column').nth(0).locator('.contract-entry', { hasText: 'Utility Gain' }).click();
  await page.locator('.contract-arrows button').first().click();

  const file = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .adg' }).click()]).then(
    ([d]) => d,
  );
  // Named after the code, one file per rack, as the convention says.
  expect(file.suggestedFilename()).toBe('BS.adg');

  const xml = gunzipSync(readFileSync((await file.path())!)).toString('utf8');
  expect(xml.split('<?xml')).toHaveLength(2);
  // The macro label, the rack name and the inserted device all read the code.
  expect(xml).toContain('<MacroDisplayNames.0 Value="BS GAIN"/>');
  expect(xml).toContain('<UserName Value="BS"/>');
  // The Utility the contract inserted, named from the same code.
  expect(xml).toContain('<StereoGain');
  expect(xml).toContain('<UserName Value="BS GAIN"/>');
});

test('a macro driving several parameters is one row until it is opened', async ({ page }) => {
  // What the contract writes is one knob across every chain, and four
  // identical rows say nothing four times.
  await loadRack(page);
  const summary = page.locator('.mapping-summary').first();
  await expect(summary).toBeVisible();
  await expect(summary.locator('.mapping-fanout')).toHaveText('x2');

  await summary.dblclick();
  await expect(page.locator('.mapping-summary')).toHaveCount(0);
  await expect(page.locator('.mapping-grid tbody tr', { hasText: 'ParamC' })).toHaveCount(1);
});

test('a macro can be reset from its own knob', async ({ page }) => {
  await loadRack(page);
  const knob = rootKnobs(page).first();
  await expect(knob.locator('.macro-knob-name')).toHaveText('ParamA');
  await knob.locator('.macro-knob-reset').click();

  // Unbound, back to the default name, and no colour.
  await expect(knob.locator('.macro-knob-name')).toHaveText('Macro 1');
  await expect(knob).toHaveClass(/unmapped/);
});

test('a rack feature is added with the arrow and reordered by dragging', async ({ page }) => {
  await loadRack(page);
  await page.locator('.contract-code').fill('BS');
  await page.locator('.contract-code').press('Enter');

  const available = page.locator('.contract-column').nth(0);
  const inRack = page.locator('.contract-column').nth(1);
  const [addButton, removeButton] = [page.locator('.contract-arrows button').nth(0), page.locator('.contract-arrows button').nth(1)];

  await available.locator('.contract-entry', { hasText: 'Auto Filter' }).click();
  await addButton.click();
  await available.locator('.contract-entry', { hasText: 'Utility Gain' }).click();
  await addButton.click();
  await expect(inRack.locator('.contract-entry-name')).toHaveText(['BS FILTER', 'BS GAIN']);
  await expect(rootKnobs(page).nth(0).locator('.macro-knob-name')).toHaveText('BS FILTER');

  // Drag the second one over the first: the list order IS the knob order.
  const rows = inRack.locator('li[data-feature-index]');
  const source = rows.nth(1).locator('.contract-grip');
  const target = rows.nth(0);
  await source.hover();
  await page.mouse.down();
  await target.hover();
  await page.mouse.up();

  await expect(inRack.locator('.contract-entry-name')).toHaveText(['BS GAIN', 'BS FILTER']);
  await expect(rootKnobs(page).nth(0).locator('.macro-knob-name')).toHaveText('BS GAIN');

  // And back out through the other arrow.
  await inRack.locator('.contract-entry', { hasText: 'BS GAIN' }).click();
  await removeButton.click();
  await expect(inRack.locator('.contract-entry-name')).toHaveText(['BS FILTER']);
});

test('EQ Three is one feature with three knobs, and a band can be dropped', async ({ page }) => {
  await loadRack(page);
  await page.locator('.contract-code').fill('BS');
  await page.locator('.contract-code').press('Enter');

  const available = page.locator('.contract-column').nth(0);
  await expect(available.locator('.contract-entry', { hasText: 'EQ Three' })).toHaveCount(1);
  await available.locator('.contract-entry', { hasText: 'EQ Three' }).click();
  await page.locator('.contract-arrows button').first().click();

  await expect(page.locator('.contract-column').nth(1).locator('.contract-entry-name')).toHaveText(['BS EQ (Lo, Mid, Hi)']);
  await expect(rootKnobs(page).nth(0).locator('.macro-knob-name')).toHaveText('BS LO');
  await expect(rootKnobs(page).nth(2).locator('.macro-knob-name')).toHaveText('BS HI');

  // Dropping the Mid band drops its knob and keeps the EQ.
  await page.locator('.contract-band', { hasText: 'Mid' }).locator('input[type="checkbox"]').uncheck();
  await expect(rootKnobs(page).nth(1).locator('.macro-knob-name')).toHaveText('BS HI');
  await expect(page.locator('.contract-column').nth(1).locator('.contract-entry-name')).toHaveText(['BS EQ (Lo, Hi)']);
});

test('a chain wears its colour, and so do the macros that only drive it', async ({ page }) => {
  await loadRack(page);
  await rootChainRows(page).first().locator('.chain-swatch').click();
  await page.locator('.color-swatch').nth(21).click();

  const row = rootChainRows(page).first();
  await expect
    .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe('rgb(58, 61, 69)'); // the default row grey
  // The knob that drives only that chain now matches it.
  const knobColour = await rootKnobs(page).first().evaluate((el) => getComputedStyle(el).getPropertyValue('--macro-color').trim());
  const rowColour = await row.evaluate((el) => getComputedStyle(el).getPropertyValue('--chain-color').trim());
  expect(knobColour).toBe(rowColour);
});

test('the cables stay inside the rack row', async ({ page }) => {
  await loadRack(page);
  await openFirstDevice(page);
  await turnMapOn(page);
  await expect(page.locator('.mapping-cable').first()).toBeVisible();

  // The layer covers the viewport, so it is clipped to the row: without that,
  // a cable to a control scrolled out of view was drawn across the page.
  const clip = await page.locator('.mapping-cable-layer').evaluate((el) => getComputedStyle(el).clipPath);
  expect(clip).toContain('inset');
});

test('the rack sits above the two panels, which stack when there is no room', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loadRack(page);

  const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
  const row = await box('.rack-editor-scroll');
  const features = await box('.contract-strip');
  const mappings = await box('.mapping-table');

  // The rack first, and it gets the width; the panels read it from underneath.
  expect(features.y).toBeGreaterThan(row.y + row.height - 1);
  expect(Math.abs(features.y - mappings.y)).toBeLessThan(2); // side by side
  expect(mappings.x).toBeGreaterThan(features.x + features.width - 1);

  await page.setViewportSize({ width: 700, height: 1000 });
  const narrowFeatures = await box('.contract-strip');
  const narrowMappings = await box('.mapping-table');
  // No room for both, so one goes under the other rather than shrinking to
  // nothing.
  expect(narrowMappings.y).toBeGreaterThan(narrowFeatures.y + narrowFeatures.height - 1);
});

test('the page fits a phone, and only the rack and the table scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadRack(page);

  // Nothing may push the PAGE sideways: a phone with a horizontal scrollbar
  // means something is laid out for a desktop and the user gets to hunt for
  // it. The rack row and the mapping table scroll inside themselves instead.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const rackScrolls = await page.locator('.rack-editor-scroll').evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(rackScrolls).toBe(true);
  const tableScrolls = await page.locator('.mapping-scroll').evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(tableScrolls).toBe(true);

  // The two lists stack rather than sharing a line 190px wide.
  const available = (await page.locator('.contract-column').nth(0).boundingBox())!;
  const inRack = (await page.locator('.contract-column').nth(1).boundingBox())!;
  expect(inRack.y).toBeGreaterThan(available.y + available.height - 1);
});

test('it is installable: icons, theme colour and an apple touch icon', async ({ page }) => {
  await page.goto('/');
  // A manifest with no icons is not installable at all - both Chrome and
  // Safari decline to offer it - and iOS reads the link tags rather than the
  // manifest.
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png$/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#14151a');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');

  for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.svg']) {
    const response = await page.request.get(`/${icon}`);
    expect(response.status(), icon).toBe(200);
  }
});

test('dropping a parameter back on its own macro leaves one cable, not two', async ({ page }) => {
  await loadRack(page);
  await turnMapOn(page);
  await openFirstDevice(page);

  const param = page.locator('.mapped-params .param', { hasText: 'ParamA' }).first();
  const knob = rootKnobs(page).first();
  const before = await page.locator('.mapping-cable').count();

  await param.hover();
  await page.mouse.down();
  await knob.hover();
  // Over the macro that already drives it: the cable stops promising a
  // connection, because dropping there does nothing.
  await expect(page.locator('.patch-cable')).toHaveClass(/already-bound/);
  await page.mouse.up();

  // No connect echo on top of the cable that is already drawn.
  await expect(page.locator('.patch-cable')).toHaveCount(0);
  await expect.poll(() => page.locator('.mapping-cable').count()).toBe(before);
});

test('the rack row and the panels under it share one width', async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await loadRack(page);

  const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
  const row = await box('.rack-editor-scroll');
  const features = await box('.contract-strip');
  const mappings = await box('.mapping-table');

  // One block: same left edge, same right edge, whatever the rack's own width.
  expect(Math.round(row.x)).toBe(Math.round(features.x));
  expect(Math.round(row.x + row.width)).toBe(Math.round(mappings.x + mappings.width));
  // A rack narrower than the block is padded out by empty device slots rather
  // than leaving a gap that reads as a layout fault.
  await expect(page.locator('.rack-filler')).toBeVisible();
});

test('devices fold as the row runs out of width, and come back when it does not', async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await loadRack(page);

  // Open what there is room for. The list re-renders after each click.
  for (let i = 0; i < 4; i++) {
    const strip = page.locator('.device-panel.collapsed .device-title-strip').first();
    if ((await strip.count()) === 0) break;
    await strip.click();
  }
  const wide = await page.locator('.device-panel:not(.collapsed)').count();
  expect(wide).toBeGreaterThan(0);
  // A nested rack starts closed and the budget must not open it.
  await expect(page.locator('.rack-panel.collapsed')).toHaveCount(1);

  await page.setViewportSize({ width: 800, height: 1000 });
  await expect.poll(() => page.locator('.device-panel:not(.collapsed)').count()).toBeLessThan(wide);

  // Folding is a view, not a decision: the width comes back and so do they.
  await page.setViewportSize({ width: 1900, height: 1000 });
  await expect.poll(() => page.locator('.device-panel:not(.collapsed)').count()).toBe(wide);
});

test('the landing is the two controls, with the walkthrough behind a question mark', async ({ page }) => {
  await page.goto('/');

  // In and out first, directly under the masthead: the guide used to sit
  // between them and the title.
  const masthead = (await page.locator('.app > header').boundingBox())!;
  const transfer = (await page.locator('.transfer').boundingBox())!;
  const guide = (await page.locator('.getting-started').boundingBox())!;
  expect(transfer.y).toBeGreaterThan(masthead.y);
  expect(guide.y).toBeGreaterThan(transfer.y);

  // Both halves are one box: the same height, whatever is in them.
  const dropzone = (await page.locator('.dropzone').boundingBox())!;
  const exportzone = (await page.locator('.exportzone').boundingBox())!;
  expect(Math.round(dropzone.height)).toBe(Math.round(exportzone.height));
  expect(Math.round(dropzone.y)).toBe(Math.round(exportzone.y));

  // The screenshots are in a panel now, not on the page.
  await expect(page.locator('.guide-steps')).toHaveCount(0);
  await page.locator('.help-button').first().click();
  await expect(page.locator('.modal .guide-steps li')).toHaveCount(3);

  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
});

test.describe('the plugin strip (doc/PLAN.md 4.1)', () => {
  test('names the class id and the chain, and takes no space on a rack without one', async ({ page }) => {
    await loadRack(page, 'plugin');
    const strip = page.locator('.plugin-strip');
    await expect(strip).toBeVisible();
    // Nothing has resolved the id: what is shown is the id, in the readable
    // form this vendor happens to build (SCHEMA.md Q17).
    await expect(strip.locator('.plugin-uid')).toHaveText('ArtuAVISMBRTProc');
    await expect(strip.locator('.plugin-where')).toHaveText('MiniBrute');
    // The strip sits above the rack and must not push it off the row.
    await expect(page.locator('.rack-row > .panel.rack-panel').first()).toBeVisible();
  });

  test('a rack with no plugins draws no strip', async ({ page }) => {
    await loadRack(page);
    await expect(page.locator('.plugin-strip')).toHaveCount(0);
  });
});

test('a macro driving a plugin parameter is listed, with a range it does not offer to edit', async ({ page }) => {
  await loadRack(page, 'plugin-mapped');
  // Slot 13, driven by MacroControlIndex and by no KeyMidi at all (SCHEMA.md
  // Q20). It used to be missing from this table entirely.
  const row = mappingRowForSlot(page, 13);
  await expect(row).toHaveCount(1);
  await expect(row.locator('.col-name')).toHaveText('Parameter 70');
  await expect(row.locator('.mapping-fixed')).toHaveCount(2);
  await expect(row.locator('.mapping-invert')).toHaveCount(0);
});

test('the version badge is the repo version, not a literal somebody has to remember', async ({ page }) => {
  await page.goto('/');
  // The site shipped reading v0.2.0 while the repo had moved on. The badge is
  // substituted from package.json at build time (`vite.config.ts`), and this
  // is what stops it drifting again.
  const version = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json'), 'utf8'),
  ).version as string;
  await expect(page.locator('.masthead .badge')).toHaveText(`v${version} beta`);
});

test('the mapping table sorts by a column header, and gives the file order back', async ({ page }) => {
  await loadRack(page);
  const names = () => page.locator('.mapping-grid tbody .col-name').allTextContents();
  const header = (label: string) => page.locator('.mapping-grid th .mapping-sort', { hasText: label });

  const asWritten = await names();
  await header('Name').click();
  const ascending = await names();
  expect(ascending).not.toEqual(asWritten);
  await expect(page.locator('.mapping-grid th.col-name')).toHaveAttribute('aria-sort', 'ascending');

  await header('Name').click();
  expect(await names()).toEqual([...ascending].reverse());

  await header('Name').click();
  expect(await names()).toEqual(asWritten);
});

/**
 * Saving over the original (doc/PLAN.md 4.6).
 *
 * The picker cannot be driven from a test - it is a browser dialog - so the
 * page is given one that returns a handle over bytes the test controls. What
 * that leaves real is everything this project can actually get wrong: that
 * opening through a handle enables the control, that overwriting takes two
 * clicks, and that what lands in the file is a rack Live could open.
 */
async function stubPicker(page: Page, bytes: Buffer, fileName = 'BS.adg') {
  await page.addInitScript(
    ([base64, name]) => {
      const raw = atob(base64 as string);
      const data = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const written: number[][] = [];
      (window as unknown as { __written: number[][] }).__written = written;
      const handle = {
        name,
        getFile: async () => new File([data as BlobPart], name as string),
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        createWritable: async () => ({
          write: async (chunk: BufferSource) => {
            written.push([...new Uint8Array(chunk as ArrayBufferLike)]);
          },
          close: async () => {},
        }),
      };
      (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = async () => [handle];
    },
    [bytes.toString('base64'), fileName] as const,
  );
}

test('a rack opened through the picker can be saved back over itself, in two clicks', async ({ page }) => {
  await stubPicker(page, readFileSync(writeRackFile()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open a rack' }).click();
  await page.waitForSelector('.macro-knob');

  // Read-only until asked: the destructive control is a second button, and the
  // first click on it only names the file.
  await expect(page.locator('.overwrite-yes')).toHaveCount(0);
  await page.locator('.transfer-secondary').click();
  await expect(page.locator('.overwrite-yes')).toHaveText('Overwrite BS.adg');

  await page.locator('.overwrite-yes').click();
  await expect(page.locator('.transfer-note').last()).toContainText('Saved over BS.adg');

  const written = await page.evaluate(() => (window as unknown as { __written: number[][] }).__written);
  expect(written).toHaveLength(1);
  // A gzip that unpacks to a rack, not a blob of whatever was in memory.
  const bytes = Buffer.from(written[0]);
  expect(bytes[0]).toBe(0x1f);
  expect(gunzipSync(bytes).toString()).toContain('<GroupDevicePreset');
});

test('cancelling leaves the file alone', async ({ page }) => {
  await stubPicker(page, readFileSync(writeRackFile()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open a rack' }).click();
  await page.waitForSelector('.macro-knob');

  await page.locator('.transfer-secondary').click();
  await page.locator('.overwrite-no').click();
  await expect(page.locator('.overwrite-yes')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __written: number[][] }).__written)).toHaveLength(0);
});

test('a rack opened through the file input offers Export and nothing destructive', async ({ page }) => {
  // No handle, so no way back to the original - and the control that would
  // need one is simply not there.
  await loadRack(page);
  await expect(page.locator('.transfer-secondary')).toHaveCount(0);
});

test('a knob the user already made is reused rather than emptied', async ({ page }) => {
  await loadRack(page, 'handmade');
  await page.locator('.contract-entry-name', { hasText: 'Utility Gain' }).click();
  await page.locator('.contract-arrows button').first().click();

  // The question comes before anything happens to the rack.
  await expect(page.locator('.contract-adopt')).toContainText('KICK GAIN');
  await expect(page.locator('.macro-knob-name', { hasText: 'KICK GAIN' })).toHaveCount(1);

  await page.locator('.adopt-yes').click();
  await expect(page.locator('.contract-adopt')).toHaveCount(0);
  // That knob IS the feature now: renamed, in the leading slot, and no knob
  // called KICK GAIN left driving nothing.
  await expect(page.locator('.macro-knob-name', { hasText: 'KICK GAIN' })).toHaveCount(0);
  await expect(page.locator('.macro-knob').first().locator('.macro-knob-name')).toHaveText(/GAIN/);
});

test('the rack name is one name: renaming it anywhere renames it everywhere', async ({ page }) => {
  await loadRack(page);
  const strip = page.locator('.contract-code');
  const title = page.locator('.rack-name').first();

  // From the title bar. The strip's box used to keep the name the rack had
  // when it mounted, so the two read as separate things.
  await title.dblclick();
  await page.locator('.rack-name-input').first().fill('KD');
  await page.locator('.rack-name-input').first().blur();
  await expect(title).toHaveText('KD');
  await expect(strip).toHaveValue('KD');

  // And back the other way.
  await strip.fill('ZZ');
  await strip.blur();
  await expect(title).toHaveText('ZZ');
});

/**
 * The phone. A touch context is not the same page as a narrow window: the
 * file input filters differently, and the row that scrolls sideways is made
 * of the same knobs a drag starts on.
 */
test('the file input offers every file, so Android can reach a rack at all', async ({ page }) => {
  await page.goto('/');
  // Android's picker filters by MIME type, derived from `accept`, and knows no
  // `.adg` - every rack in Downloads greyed out. Restricting the attribute to
  // desktop by `(pointer: coarse)` did not fix it either: that query does not
  // match on a Pixel. The gzip check refuses anything that is not a rack.
  await expect(page.locator('input[type=file]')).not.toHaveAttribute('accept', /.*/);
});

test('a file that is not a rack is refused by its bytes, with a message', async ({ page }) => {
  await page.goto('/');
  const notARack = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json');
  await page.setInputFiles('input[type=file]', notARack);
  await expect(page.locator('.error')).toContainText('not a gzipped .adg file');
});

test('the rack row can be scrolled sideways from a knob', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.setInputFiles('input[type=file]', writeRackFile());
  await page.waitForSelector('.macro-knob');

  // `touch-action: none` here - which is what a pointer drag normally wants -
  // is what made the row unscrollable with a finger.
  const knobTouch = await page.locator('.macro-knob').first().evaluate((el) => getComputedStyle(el).touchAction);
  expect(knobTouch).toBe('manipulation');

  const scroller = page.locator('.rack-editor-scroll');
  const scrollable = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrollable).toBe(true);
  await scroller.evaluate((el) => el.scrollBy({ left: 200 }));
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await context.close();
});
