#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const port = process.env.PORT || '5173';
const url = process.env.URL || `http://localhost:${port}`;
const out = process.argv[2] || '/tmp/screenshot.png';
const epub = process.argv[3] || path.join(root, 'dld9_tb_preview.epub');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(url);
await page.waitForLoadState('networkidle');

if (fs.existsSync(epub)) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(epub);
  await page.waitForTimeout(4000);
}

await page.screenshot({ path: out, fullPage: false });
console.log(out);
await browser.close();
