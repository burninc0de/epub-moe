import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixturePath = path.join(rootDir, 'dld9_tb_preview.epub');
const fixtureUrl = process.env.EPUB_FIXTURE_URL ?? 'https://preview.learnoutlive.com/epubs/dld9_tb_preview.epub';
const minBytes = 100 * 1024;

const fileExists = async (filePath) => {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size >= minBytes;
  } catch {
    return false;
  }
};

if (await fileExists(fixturePath)) {
  console.log(`Fixture already present: ${fixturePath}`);
  process.exit(0);
}

console.log(`Fixture missing, downloading from ${fixtureUrl}...`);
try {
  const response = await fetch(fixtureUrl);
  if (!response.ok) {
    throw new Error(`download failed with HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(fixturePath, buffer);
  const size = (await stat(fixturePath)).size;
  if (size < minBytes) {
    console.warn(`Warning: downloaded fixture is suspiciously small (${size} bytes).`);
  }
  console.log(`Fixture downloaded to ${fixturePath} (${size} bytes)`);
} catch (err) {
  console.warn(`Could not download fixture: ${err.message}`);
  console.warn('Playwright tests will skip. See readme.md Testing section for the URL.');
}
