import { describe, it, expect } from 'vitest';
import {
  buildSMIL,
  calculateTotalDuration,
  clipSignature,
  toXmlId,
  updateOPFWithDuration,
} from './smilBuilder';
import { formatSMILDuration } from './time';
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

  it('sums the clip durations', () => {
    const fragments = [
      makeFragment({ clipBegin: 0, clipEnd: 2 }),
      makeFragment({ id: 'smil1::p2', clipBegin: 2, clipEnd: 7.5 }),
      makeFragment({ id: 'smil1::p3', clipBegin: 7.5, clipEnd: 9 }),
    ];
    expect(calculateTotalDuration(fragments)).toBe(9);
  });

  it('leaves out the lead-in before the first clip', () => {
    expect(calculateTotalDuration([makeFragment({ clipBegin: 5, clipEnd: 20 })])).toBe(15);
  });

  it('leaves out gaps between clips', () => {
    const fragments = [
      makeFragment({ clipBegin: 0, clipEnd: 5 }),
      makeFragment({ id: 'smil1::p2', clipBegin: 8, clipEnd: 10 }),
    ];
    expect(calculateTotalDuration(fragments)).toBe(7);
  });

  it('sums clips that come from different audio files', () => {
    const fragments = [
      makeFragment({ audioSrc: 'a.mp3', clipBegin: 0, clipEnd: 73.74 }),
      makeFragment({ id: 'smil1::p2', audioSrc: 'b.mp3', clipBegin: 0, clipEnd: 65.12 }),
    ];
    expect(calculateTotalDuration(fragments)).toBeCloseTo(138.86, 2);
  });
});

describe('clipSignature', () => {
  it('is stable for the same timings', () => {
    const fragments = [makeFragment({ clipBegin: 0, clipEnd: 2 })];
    expect(clipSignature(fragments)).toBe(clipSignature(fragments.map(f => ({ ...f }))));
  });

  it('changes when a boundary moves', () => {
    const before = clipSignature([makeFragment({ clipBegin: 0, clipEnd: 2 })]);
    const after = clipSignature([makeFragment({ clipBegin: 0, clipEnd: 2.5 })]);
    expect(after).not.toBe(before);
  });

  it('changes when a fragment is removed', () => {
    const fragments = [makeFragment({ clipEnd: 2 }), makeFragment({ id: 'smil1::p2', order: 1, clipBegin: 2, clipEnd: 3 })];
    expect(clipSignature(fragments.slice(1))).not.toBe(clipSignature(fragments));
  });

  it('ignores text and audio sources, which do not change duration', () => {
    const before = clipSignature([makeFragment({ textSrc: 'a.xhtml#t1', audioSrc: 'a.mp3' })]);
    const after = clipSignature([makeFragment({ textSrc: 'b.xhtml#t9', audioSrc: 'b.mp3' })]);
    expect(after).toBe(before);
  });
});

describe('toXmlId', () => {
  it('leaves valid ids untouched', () => {
    expect(toXmlId('x00-salut_xhtml_overlay')).toBe('x00-salut_xhtml_overlay');
    expect(toXmlId('chapter1.xhtml_overlay')).toBe('chapter1.xhtml_overlay');
    expect(toXmlId('_overlay')).toBe('_overlay');
  });

  it('prefixes ids that cannot start an XML name', () => {
    expect(toXmlId('00-salut.xhtml_overlay')).toBe('id_00-salut.xhtml_overlay');
    expect(toXmlId('-ch1_overlay')).toBe('id_-ch1_overlay');
    expect(toXmlId('.hidden_overlay')).toBe('id_.hidden_overlay');
  });

  it('replaces characters an XML name cannot contain', () => {
    expect(toXmlId('a:b c_overlay')).toBe('a_b_c_overlay');
    expect(toXmlId('Frühstück_overlay')).toBe('Frühstück_overlay');
  });

  it('falls back when nothing usable is left', () => {
    expect(toXmlId('')).toBe('overlay');
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

  it('removes self-closing metas as well', async () => {
    const opf = `<package>
  <metadata>
    <meta property="media:duration" refines="#smil1" />
  </metadata>
</package>`;

    const updated = await updateOPFWithDuration(opf, new Map([['smil1', 5]]));

    expect(updated.match(/media:duration/g)).toHaveLength(2);
    expect(updated).toContain('>00:00:05.00</meta>');
  });

  it('is idempotent, so exporting the same book twice does not accumulate blank lines', async () => {
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package>
  <metadata>
    <dc:title>Test</dc:title>
    <meta property="media:duration" refines="#smil1">00:00:09.00</meta>
    <meta property="media:duration">00:00:09.00</meta>
  </metadata>
</package>`;
    const durations = new Map([['smil1', 5]]);

    const once = await updateOPFWithDuration(opf, durations);
    const twice = await updateOPFWithDuration(once, durations);

    expect(twice).toBe(once);
  });
});
