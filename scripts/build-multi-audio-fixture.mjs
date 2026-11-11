import { readFile, stat, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourcePath = path.join(rootDir, 'dld9_tb_preview.epub');
const duplicatedPath = path.join(rootDir, 'dld9_multi_audio.epub');
const splitPath = path.join(rootDir, 'dld9_split_audio.epub');

const fail = (message) => {
  console.error(`Cannot build multi-audio fixture: ${message}`);
  process.exit(1);
};

const exists = async (filePath) => {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
};

const toSeconds = (value) => {
  if (!value) return 0;
  const trimmed = value.trim();
  if (trimmed.includes(':')) {
    return trimmed.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  return Number(trimmed.replace(/s$/, ''));
};

const toClock = (seconds) => `${seconds.toFixed(3)}s`;

const replacePars = (smil, handle) => {
  const chunks = smil.split(/(?=<par\b)/);
  let index = 0;
  return chunks
    .map((chunk) => {
      if (!chunk.startsWith('<par')) return chunk;
      const result = handle(chunk, index);
      index += 1;
      return result;
    })
    .join('');
};

const readFixture = async () => {
  const zip = await JSZip.loadAsync(await readFile(sourcePath));
  const names = Object.keys(zip.files);
  const audioPath = names.find((name) => name.endsWith('.mp3'));
  const smilPath = names.find((name) => name.endsWith('.smil'));
  const opfPath = names.find((name) => name.endsWith('.opf'));
  if (!audioPath || !smilPath || !opfPath) fail('fixture is missing an mp3, a smil or an opf');

  return {
    zip,
    names,
    audioPath,
    smilPath,
    opfPath,
    opfDir: path.posix.dirname(opfPath),
    opf: await zip.file(opfPath).async('text'),
    smil: await zip.file(smilPath).async('text'),
    audio: await zip.file(audioPath).async('uint8array'),
  };
};

const addPart2ToManifest = (fixture, copyHref) => {
  const audioHref = path.posix.relative(fixture.opfDir, fixture.audioPath);
  const audioItem = new RegExp(`<item\\b[^>]*href="${audioHref}"[^>]*/>`);
  const match = fixture.opf.match(audioItem);
  if (!match) fail(`no manifest item for ${audioHref}`);

  const copyItem = match[0].replace(/id="[^"]*"/, 'id="multiAudioPart2"').replace(audioHref, copyHref);
  return fixture.opf.replace(match[0], `${match[0]}\n    ${copyItem}`);
};

const write = async (targetPath, fixture, { opf, smil, part1, part2, copyPath }) => {
  const output = new JSZip();
  output.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  for (const name of fixture.names) {
    if (fixture.zip.files[name].dir || name === 'mimetype') continue;
    if (name === fixture.opfPath) output.file(name, opf);
    else if (name === fixture.smilPath) output.file(name, smil);
    else if (name === fixture.audioPath) output.file(name, part1);
    else output.file(name, await fixture.zip.file(name).async('uint8array'));
  }

  output.file(copyPath, part2);
  await writeFile(targetPath, await output.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
};

const parCount = (smil) => smil.split(/(?=<par\b)/).filter((chunk) => chunk.startsWith('<par')).length;

/** Structure-only: identical audio under a second name, every clip time untouched. */
const buildDuplicated = async (fixture) => {
  const copyPath = fixture.audioPath.replace(/\.mp3$/, '-part2.mp3');
  const copyBase = path.posix.basename(copyPath);
  const audioBase = path.posix.basename(fixture.audioPath);
  const splitAt = Math.ceil(parCount(fixture.smil) / 2);

  const smil = replacePars(fixture.smil, (par, index) =>
    index >= splitAt ? par.replaceAll(audioBase, copyBase) : par
  );

  await write(duplicatedPath, fixture, {
    opf: addPart2ToManifest(fixture, path.posix.relative(fixture.opfDir, copyPath)),
    smil,
    part1: fixture.audio,
    part2: fixture.audio,
    copyPath,
  });

  console.log(`Structure-only fixture: ${duplicatedPath} (pars from ${splitAt} play a copy of the same audio)`);
};

/** Genuine: the narration is split in two without re-encoding, and the second half is rebased. */
const buildSplit = async (fixture) => {
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (ffmpeg.status !== 0) {
    console.log('ffmpeg not found, skipping the split fixture.');
    return;
  }

  const leading = fixture.smil.split(/(?=<par\b)/).filter((chunk) => chunk.startsWith('<par'));
  const splitAt = Math.ceil(leading.length / 2);
  const splitPoint = toSeconds(leading[splitAt].match(/clipBegin="([^"]*)"/)?.[1]);

  const workDir = await mkdtemp(path.join(os.tmpdir(), 'epub-moe-split-'));
  const sourceAudio = path.join(workDir, 'source.mp3');
  const firstHalf = path.join(workDir, 'part1.mp3');
  const secondHalf = path.join(workDir, 'part2.mp3');
  await writeFile(sourceAudio, fixture.audio);

  const cut = (args) => {
    const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
    if (result.status !== 0) fail('ffmpeg could not split the audio');
  };

  cut(['-i', sourceAudio, '-to', String(splitPoint), '-c', 'copy', '-avoid_negative_ts', 'make_zero', firstHalf]);
  cut(['-ss', String(splitPoint), '-i', sourceAudio, '-c', 'copy', '-avoid_negative_ts', 'make_zero', secondHalf]);

  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', firstHalf,
  ], { encoding: 'utf8' });
  const actualSplit = Number(probe.stdout.trim());

  const audioBase = path.posix.basename(fixture.audioPath);
  const copyPath = fixture.audioPath.replace(/\.mp3$/, '-part2.mp3');
  const copyBase = path.posix.basename(copyPath);

  const smil = replacePars(fixture.smil, (par, index) => {
    if (index < splitAt) return par;

    const begin = toSeconds(par.match(/clipBegin="([^"]*)"/)?.[1]) - actualSplit;
    const end = toSeconds(par.match(/clipEnd="([^"]*)"/)?.[1]) - actualSplit;

    return par
      .replace(/clipBegin="[^"]*"/, `clipBegin="${toClock(Math.max(0, begin))}"`)
      .replace(/clipEnd="[^"]*"/, `clipEnd="${toClock(Math.max(0, end))}"`)
      .replaceAll(audioBase, copyBase);
  });

  await write(splitPath, fixture, {
    opf: addPart2ToManifest(fixture, path.posix.relative(fixture.opfDir, copyPath)),
    smil,
    part1: new Uint8Array(await readFile(firstHalf)),
    part2: new Uint8Array(await readFile(secondHalf)),
    copyPath,
  });

  await rm(workDir, { recursive: true, force: true });

  console.log(
    `Split fixture: ${splitPath} (audio split at ${actualSplit.toFixed(3)}s, ` +
    `pars from ${splitAt} rebased onto the second file, drift ${(actualSplit - splitPoint).toFixed(3)}s)`
  );
};

if (!(await exists(sourcePath))) {
  console.log('Single-audio fixture missing, skipping multi-audio fixtures.');
  process.exit(0);
}

if ((await exists(duplicatedPath)) && (await exists(splitPath))) {
  console.log(`Fixtures already present: ${duplicatedPath}, ${splitPath}`);
  process.exit(0);
}

const fixture = await readFixture();
if (!(await exists(duplicatedPath))) await buildDuplicated(fixture);
if (!(await exists(splitPath))) await buildSplit(fixture);
