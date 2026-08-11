import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FIXTURE = path.join(process.cwd(), 'dld9_tb_preview.epub');

test.beforeAll(() => {
  test.skip(!existsSync(FIXTURE), `fixture not found: ${FIXTURE}. Drop a talking-book EPUB there to run the smoke tests.`);
});

async function loadEPUB(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.setInputFiles('input[type="file"][accept=".epub"]', FIXTURE);
}

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
