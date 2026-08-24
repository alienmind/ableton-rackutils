import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
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
const rootBody = (page: Page) => page.locator('.rack-editor-scroll > .rack-panel > .rack-body');
const rootKnobs = (page: Page) => rootBody(page).locator('> .macro-bank-wrap .macro-knob');
const rootDials = (page: Page) => rootBody(page).locator('> .macro-bank-wrap .macro-knob-dial');
const rootChainRows = (page: Page) => rootBody(page).locator('> .chain-list .chain-row');
const macroNames = (page: Page) => rootKnobs(page).locator('.macro-knob-name').allTextContents();

/** Pointer drag, the gesture the UI actually uses. HTML5 drag-and-drop was the first implementation and did nothing here. */
async function dragKnob(page: Page, from: number, to: number, shift = false) {
  // Scroll the knobs into view FIRST. The page header is tall enough to push
  // the editor below the fold at the default viewport, and `mouse.move` to a
  // coordinate outside the viewport quietly does nothing - which looks exactly
  // like a broken drag.
  await rootDials(page).nth(from).scrollIntoViewIfNeeded();
  const a = (await rootDials(page).nth(from).boundingBox())!;
  const b = (await rootDials(page).nth(to).boundingBox())!;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

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

test('the x on a mapped target unbinds just that one', async ({ page }) => {
  await loadRack(page);
  const targets = rootKnobs(page).locator('.macro-knob-targets li');
  const before = await targets.count();
  expect(before).toBeGreaterThan(1);
  await page.locator('.unbind').first().click();
  await expect(targets).toHaveCount(before - 1);
});

test('picking a colour recolours the knob', async ({ page }) => {
  await loadRack(page);
  const knob = rootKnobs(page).first();
  const before = await knob.evaluate((el) => getComputedStyle(el).getPropertyValue('--macro-color'));
  await rootKnobs(page).locator('.macro-knob-swatch').first().click();
  await page.locator('.color-picker .color-swatch').nth(6).click();
  await expect
    .poll(() => knob.evaluate((el) => getComputedStyle(el).getPropertyValue('--macro-color')))
    .not.toBe(before);
});

test('arming a parameter then clicking a knob binds it', async ({ page }) => {
  await loadRack(page);
  await page.locator('.more-toggle').first().click();
  await page.locator('.param', { hasText: 'ParamB' }).first().click();
  await rootDials(page).nth(3).click();
  await expect(rootKnobs(page).nth(3).locator('.target-name')).toContainText('ParamB');
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

  // Nothing may overflow vertically: the layout scrolls sideways, as Live does.
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('.rack-editor *')]
      .filter((e) => e.scrollHeight > e.clientHeight + 2 && !e.className.toString().includes('sr-only'))
      .map((e) => e.className.toString()),
  );
  expect(clipped).toEqual([]);
});

test('dragging a parameter onto a knob binds it', async ({ page }) => {
  // The gesture people reach for first. Binding used to be click-to-arm then
  // click-a-knob, which is discoverable only if you read the instructions.
  await loadRack(page);
  await page.locator('.more-toggle').first().scrollIntoViewIfNeeded();
  await page.locator('.more-toggle').first().click();

  const param = page.locator('.param', { hasText: 'ParamB' }).first();
  const knob = rootKnobs(page).nth(5);
  const from = (await param.boundingBox())!;
  const to = (await knob.boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(knob.locator('.target-name')).toContainText('ParamB');
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
