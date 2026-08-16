import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const FIXTURE = path.join(process.cwd(), 'dld9_tb_preview.epub');

test.beforeAll(() => {
  test.skip(!existsSync(FIXTURE), `fixture not found: ${FIXTURE}. Drop a talking-book EPUB there to run the smoke tests.`);
});

async function loadEPUB(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.setInputFiles('input[type="file"][accept=".epub"]', FIXTURE);
}

const fragmentCountText = (page: import('@playwright/test').Page) =>
  page.getByText(/^\d+ fragments total$/);

const currentFragmentCount = async (page: import('@playwright/test').Page) => {
  const text = await fragmentCountText(page).textContent();
  const match = text?.match(/(\d+)\s+fragments total/);
  return match ? parseInt(match[1], 10) : -1;
};

const regionStyle = (region: import('@playwright/test').Locator) =>
  region.evaluate((el) => ({ left: parseFloat(el.style.left), right: parseFloat(el.style.right) }));

const gapBetweenRegions = async (a: import('@playwright/test').Locator, b: import('@playwright/test').Locator) => {
  const [first, second] = await Promise.all([regionStyle(a), regionStyle(b)]);
  return Math.abs(second.left - (100 - first.right));
};

test('EPUB opens and shows the chapter list', async ({ page }) => {
  await loadEPUB(page);

  await expect(page.getByRole('button', { name: 'Export EPUB' })).toBeVisible();
  await expect(page.locator('#root')).toContainText('Kapitel01');
});

test('waveform renders after loading', async ({ page }) => {
  await loadEPUB(page);

  const waveform = page.locator('.waveform-scroll').first();
  await expect(waveform).toBeVisible();
  await expect(waveform.locator('canvas').first()).toBeVisible({ timeout: 10000 });
  await expect(waveform.locator('[part="scroll"]')).toBeVisible();
});

test('waveform draws a region for the first fragment', async ({ page }) => {
  await loadEPUB(page);

  const regions = page.locator('.waveform-scroll [part~="region"]');
  await expect(regions.first()).toBeVisible({ timeout: 10000 });
  expect(await regions.count()).toBeGreaterThan(0);

  const firstContentId = await page.locator('[data-fragment-id]').first().getAttribute('data-fragment-id');
  const fragmentSuffix = firstContentId?.split('::').pop();
  expect(fragmentSuffix).toBeTruthy();
  await expect(page.locator(`.waveform-scroll [part~="region"][part*="${fragmentSuffix}"]`)).toBeVisible();
});

test('HTML editor opens', async ({ page }) => {
  await loadEPUB(page);

  const codeButton = page.getByTitle('Edit HTML Source');
  await codeButton.click();
  await expect(page.locator('#html-editor')).toBeVisible();
});

test('EPUB exports as a download', async ({ page }) => {
  await loadEPUB(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export EPUB' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('exported.epub');
});

test('clicking a fragment selects it and shows its timing', async ({ page }) => {
  await loadEPUB(page);

  const firstFragment = page.locator('[data-fragment-id]').first();
  await expect(firstFragment).toBeVisible();
  await firstFragment.click();

  await expect(firstFragment).toHaveClass(/bg-blue-500\/25/);
  await expect(page.getByText('Start Time').locator('..').locator('input')).toHaveValue('0:00.270');
  await expect(page.getByText('End Time').locator('..').locator('input')).toHaveValue('0:04.266');
});

test('cut tool splits a fragment at a word boundary', async ({ page }) => {
  await loadEPUB(page);

  const before = await currentFragmentCount(page);
  await expect(page.locator('[data-fragment-id]').first()).toBeVisible();

  await page.getByTitle(/Activate Cut Tool/).click();
  await page.locator('[data-fragment-id]').first().click();

  await expect(fragmentCountText(page)).toHaveText(`${before + 1} fragments total`);
  await expect(page.locator('[data-fragment-id$="_part1"]').first()).toBeVisible();
  await expect(page.locator('[data-fragment-id$="_part2"]').first()).toBeVisible();
});

test('editing fragment timing applies to the fragment', async ({ page }) => {
  await loadEPUB(page);

  await page.locator('[data-fragment-id]').first().click();
  const endTimeInput = page.getByText('End Time').locator('..').locator('input');
  await expect(endTimeInput).toHaveValue('0:04.266');

  await endTimeInput.fill('0:05.000');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(endTimeInput).toHaveValue('0:05.000');
});

test('nudge buttons adjust fragment timing', async ({ page }) => {
  await loadEPUB(page);

  await page.locator('[data-fragment-id]').first().click();
  const startTimeInput = page.getByText('Start Time').locator('..').locator('input');
  await expect(startTimeInput).toHaveValue('0:00.270');

  await page.getByTitle('Nudge start later by 0.05s').click();
  await expect(startTimeInput).toHaveValue('0:00.320');
});

test('deleting a fragment removes it from content and waveform', async ({ page }) => {
  await loadEPUB(page);

  const before = await currentFragmentCount(page);
  const firstFragment = page.locator('[data-fragment-id]').first();
  const firstId = await firstFragment.getAttribute('data-fragment-id');
  const fragmentSuffix = firstId?.split('::').pop();
  await firstFragment.click();
  await page.getByTitle('Delete fragment').click();

  await expect(fragmentCountText(page)).toHaveText(`${before - 1} fragments total`);
  await expect(page.locator(`[data-fragment-id="${firstId}"]`)).toHaveCount(0);
  await expect(page.locator(`.waveform-scroll [part~="region"][part*="${fragmentSuffix}"]`)).toHaveCount(0);
});

test('critical edits (split, retime, delete) are applied in the exported EPUB', async ({ page }) => {
  await loadEPUB(page);

  // Split the first fragment with the cut tool
  await page.getByTitle(/Activate Cut Tool/).click();
  await page.locator('[data-fragment-id]').first().click();
  await expect(page.locator('[data-fragment-id$="_part1"]').first()).toBeVisible();

  // Retime the first half of the split
  await page.locator('[data-fragment-id$="_part1"]').first().click();
  const endTimeInput = page.getByText('End Time').locator('..').locator('input');
  await endTimeInput.fill('0:04.000');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(endTimeInput).toHaveValue('0:04.000');

  // Delete a later fragment (third in document order)
  const countBeforeDelete = await currentFragmentCount(page);
  const victim = page.locator('[data-fragment-id]').nth(2);
  const victimSuffix = (await victim.getAttribute('data-fragment-id'))?.split('::').pop();
  await victim.click();
  await page.getByTitle('Delete fragment').click();
  await expect(fragmentCountText(page)).toHaveText(`${countBeforeDelete - 1} fragments total`);

  // Export and verify all three edits landed in the zip
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export EPUB' }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();

  const zip = await JSZip.loadAsync(await readFile(filePath!));
  const smilFile = zip.file('OEBPS/MediaOverlays/Kapitel01.smil');
  expect(smilFile).toBeTruthy();
  const smil = await smilFile!.async('string');

  // Split: the original single par is replaced by _part1/_part2
  expect(smil).toContain('<par id="Kapitel01.html-sentence0_part1">');
  expect(smil).toContain('<par id="Kapitel01.html-sentence0_part2">');
  expect(smil).not.toContain('<par id="Kapitel01.html-sentence0">');

  // Retime: the edited clipEnd is written out
  expect(smil).toContain('clipEnd="4.000s"');

  // Delete: the victim's par is gone from the SMIL
  expect(smil).not.toContain(`<par id="${victimSuffix}">`);

  // The chapter file carries the new split spans and no longer has the original element
  const chapterFile = zip.file('OEBPS/Text/Kapitel01.html');
  expect(chapterFile).toBeTruthy();
  const chapter = await chapterFile!.async('string');
  const origZip = await JSZip.loadAsync(await readFile(FIXTURE));
  const origChapter = await origZip.file('OEBPS/Text/Kapitel01.html')!.async('string');
  const countFragSplits = (content: string) => (content.match(/id="frag-split-/g) || []).length;
  expect(countFragSplits(chapter)).toBe(countFragSplits(origChapter) + 2);
  expect(chapter).not.toContain('id="Kapitel01.html-sentence0"');

  const opfFile = zip.file('OEBPS/content.opf');
  expect(opfFile).toBeTruthy();
  expect(await opfFile!.async('string')).toContain('property="media:duration"');
});

test('dragging a region boundary updates timings and keeps neighbours snapped', async ({ page }) => {
  await loadEPUB(page);

  const regions = page.locator('.waveform-scroll [part~="region"]');
  await expect(regions.first()).toBeVisible({ timeout: 10000 });

  const firstRegion = regions.nth(0);
  const secondRegion = regions.nth(1);
  const before = await regionStyle(firstRegion);
  expect(await gapBetweenRegions(firstRegion, secondRegion)).toBeLessThan(1);

  const handle = firstRegion.locator('[part~="region-handle-right"]');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - 40, box!.y + box!.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => gapBetweenRegions(firstRegion, secondRegion)).toBeLessThan(1);
  const after = await regionStyle(firstRegion);
  expect(after.right).toBeGreaterThan(before.right + 0.25);
});

test('dragged boundary snap is preserved in exported EPUB', async ({ page }) => {
  await loadEPUB(page);

  const regions = page.locator('.waveform-scroll [part~="region"]');
  await expect(regions.first()).toBeVisible({ timeout: 10000 });

  const firstRegion = regions.nth(0);
  const secondRegion = regions.nth(1);

  const handle = firstRegion.locator('[part~="region-handle-right"]');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - 40, box!.y + box!.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => gapBetweenRegions(firstRegion, secondRegion)).toBeLessThan(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export EPUB' }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();

  const zip = await JSZip.loadAsync(await readFile(filePath!));
  const smilFile = zip.file('OEBPS/MediaOverlays/Kapitel01.smil');
  expect(smilFile).toBeTruthy();
  const smil = await smilFile!.async('string');
  const audioTimings = [...smil.matchAll(/<audio[^>]+clipBegin="([0-9.]+)s"[^>]+clipEnd="([0-9.]+)s"/g)];
  expect(audioTimings.length).toBeGreaterThan(1);

  const firstEnd = parseFloat(audioTimings[0][2]);
  const secondStart = parseFloat(audioTimings[1][1]);
  expect(Math.abs(firstEnd - secondStart)).toBeLessThan(0.01);
});

test('undo reverts a dragged boundary as one history step', async ({ page }) => {
  await loadEPUB(page);

  const regions = page.locator('.waveform-scroll [part~="region"]');
  await expect(regions.first()).toBeVisible({ timeout: 10000 });

  const firstRegion = regions.nth(0);
  const before = await regionStyle(firstRegion);

  const handle = firstRegion.locator('[part~="region-handle-right"]');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - 40, box!.y + box!.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => regionStyle(firstRegion).then((s) => s.right)).toBeGreaterThan(before.right + 0.25);

  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect.poll(() => regionStyle(firstRegion).then((s) => s.right)).toBeLessThan(before.right + 0.05);
});

test('force align rewrites fragments to continuous coverage', async ({ page }) => {
  await loadEPUB(page);

  const regions = page.locator('.waveform-scroll [part~="region"]');
  await expect(regions.first()).toBeVisible({ timeout: 10000 });

  const firstRegion = regions.nth(0);
  const secondRegion = regions.nth(1);
  expect((await regionStyle(firstRegion)).left).toBeGreaterThan(0.01);

  await page.getByTitle('Force non-overlapping segments').click();
  await page.getByRole('button', { name: 'Force Align' }).click();

  await expect.poll(() => regionStyle(firstRegion).then((s) => s.left)).toBeLessThan(0.01);
  await expect.poll(() => gapBetweenRegions(firstRegion, secondRegion)).toBeLessThan(1);
});

test('applying a time offset shifts subsequent fragments', async ({ page }) => {
  await loadEPUB(page);

  const regions = page.locator('.waveform-scroll [part~="region"]');
  await expect(regions.first()).toBeVisible({ timeout: 10000 });

  const firstRegion = regions.nth(0);
  const secondRegion = regions.nth(1);
  const before = await regionStyle(firstRegion);
  expect(await gapBetweenRegions(firstRegion, secondRegion)).toBeLessThan(1);

  await page.getByTitle('Apply Time Offset').click();
  await page.getByPlaceholder('1:23').fill('0:03');
  await page.getByPlaceholder('-2.5 or +1.2').fill('2');
  await page.getByRole('button', { name: 'Apply Offset' }).click();

  await expect.poll(() => regionStyle(firstRegion).then((s) => s.right)).toBeLessThan(before.right - 0.2);
  await expect.poll(() => gapBetweenRegions(firstRegion, secondRegion)).toBeLessThan(1);
});

test('HTML editor save applies changes and cancel discards them', async ({ page }) => {
  await loadEPUB(page);

  const codeButton = page.getByTitle('Edit HTML Source');
  await codeButton.click();
  const editor = page.locator('#html-editor');
  await expect(editor).toBeVisible();

  const html = await editor.inputValue();
  await editor.fill(html.split('Twittern').join('Plaudern'));
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('#root')).toContainText('Plaudern');
  await expect(page.locator('#root')).not.toContainText('Twittern');

  await codeButton.click();
  await editor.fill((await editor.inputValue()).split('Plaudern').join('Quatschen'));
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.locator('#root')).toContainText('Plaudern');
  await expect(page.locator('#root')).not.toContainText('Quatschen');
});

test('undo and redo restore a nudged timing change', async ({ page }) => {
  await loadEPUB(page);

  await page.locator('[data-fragment-id]').first().click();
  const startTimeInput = page.getByText('Start Time').locator('..').locator('input');
  await expect(startTimeInput).toHaveValue('0:00.270');

  await page.getByTitle('Nudge start later by 0.05s').click();
  await expect(startTimeInput).toHaveValue('0:00.320');

  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect(startTimeInput).toHaveValue('0:00.270');

  await page.getByTitle('Redo (Ctrl+Shift+Z)').click();
  await expect(startTimeInput).toHaveValue('0:00.320');
});

test('undo and redo keyboard shortcuts restore a nudged timing change', async ({ page }) => {
  await loadEPUB(page);

  await page.locator('[data-fragment-id]').first().click();
  const startTimeInput = page.getByText('Start Time').locator('..').locator('input');
  await expect(startTimeInput).toHaveValue('0:00.270');

  await page.getByTitle('Nudge start later by 0.05s').click();
  await expect(startTimeInput).toHaveValue('0:00.320');

  await page.keyboard.press('Control+z');
  await expect(startTimeInput).toHaveValue('0:00.270');

  await page.keyboard.press('Control+Shift+z');
  await expect(startTimeInput).toHaveValue('0:00.320');
});

