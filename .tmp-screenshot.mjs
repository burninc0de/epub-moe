import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  await page.goto('http://localhost:4173/');
  await page.setInputFiles('input[type="file"][accept=".epub"]', process.cwd() + '/dld9_tb_preview.epub');
  await page.waitForSelector('.waveform-scroll canvas', { timeout: 15000 });
  await page.waitForTimeout(2500);
  // select a fragment to show selection states + fragment editor
  await page.locator('[data-fragment-id]').nth(3).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/opencode/ui-after.png' });
  await browser.close();
};

run();
