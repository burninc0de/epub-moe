import { describe, it, expect } from 'vitest';
import {
  buildSMIL,
  formatSMILDuration,
  calculateTotalDuration,
  updateOPFWithDuration,
} from './smilBuilder';
import { SMILFragment } from '../types/epub';

const makeFragment = (overrides: Partial<SMILFragment>): SMILFragment => ({
  id: 'smil1::p1',
  textSrc: 'chapter1.xhtml#t1',
  audioSrc: 'audio.mp3',
  clipBegin: 0,
  clipEnd: 1,
  text: '',
  order: 0,
  ...overrides,
});

describe('formatSMILDuration', () => {
  it('formats zero', () => {
    expect(formatSMILDuration(0)).toBe('00:00:00.00');
  });

  it('formats minutes and seconds with two decimals', () => {
    expect(formatSMILDuration(61.5)).toBe('00:01:01.50');
  });

  it('formats hours', () => {
    expect(formatSMILDuration(3661)).toBe('01:01:01.00');
  });
});

describe('calculateTotalDuration', () => {
  it('returns 0 for no fragments', () => {
    expect(calculateTotalDuration([])).toBe(0);
  });

  it('returns the max clipEnd across fragments', () => {
    const fragments = [
      makeFragment({ clipEnd: 3 }),
      makeFragment({ id: 'smil1::p2', clipEnd: 7.5 }),
      makeFragment({ id: 'smil1::p3', clipEnd: 2 }),
    ];
    expect(calculateTotalDuration(fragments)).toBe(7.5);
  });
});

describe('buildSMIL', () => {
  it('writes one par per fragment with 3-decimal clip times', () => {
    const fragments = [
      makeFragment({ id: 'smil1::p1', clipBegin: 0, clipEnd: 2.5 }),
      makeFragment({ id: 'smil1::p2', textSrc: 'chapter1.xhtml#t2', clipBegin: 2.5, clipEnd: 5 }),
    ];
    const xml = buildSMIL(fragments, 'chapter1.xhtml', 'chapter1_overlay', 'smil1');

    expect(xml).toContain('clipBegin="0.000s"');
    expect(xml).toContain('clipEnd="2.500s"');
    expect(xml).toContain('clipBegin="2.500s"');
    expect(xml).toContain('clipEnd="5.000s"');
    expect(xml).toContain('src="chapter1.xhtml#t1"');
    expect(xml).toContain('src="chapter1.xhtml#t2"');
  });

  it('strips the smilId namespace prefix from par ids', () => {
    const xml = buildSMIL([makeFragment({ id: 'smil1::p1' })], 'chapter1.xhtml', 'chapter1_overlay', 'smil1');

    expect(xml).toContain('id="p1"');
    expect(xml).not.toContain('smil1::p1');
  });

  it('sorts fragments by order', () => {
    const fragments = [
      makeFragment({ id: 'smil1::p2', order: 1, clipBegin: 2.5, clipEnd: 5 }),
      makeFragment({ id: 'smil1::p1', order: 0, clipBegin: 0, clipEnd: 2.5 }),
    ];
    const xml = buildSMIL(fragments, 'chapter1.xhtml', 'chapter1_overlay', 'smil1');

    const firstPar = xml.indexOf('id="p1"');
    const secondPar = xml.indexOf('id="p2"');
    expect(firstPar).toBeGreaterThan(-1);
    expect(secondPar).toBeGreaterThan(firstPar);
  });
});

describe('updateOPFWithDuration', () => {
  it('removes existing media:duration metas and writes fresh ones with a total', async () => {
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package>
  <metadata>
    <meta property="media:duration">00:00:00.00</meta>
  </metadata>
</package>`;

    const updated = await updateOPFWithDuration(opf, new Map([['smil1', 5]]));

    expect(updated).not.toContain('00:00:00.00');
    expect(updated).toContain('refines="#smil1"');
    expect(updated).toContain('>00:00:05.00</meta>');
  });
});
