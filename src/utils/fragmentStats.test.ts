// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { SMILFragment } from '../types/epub';
import type { AlignmentAnalysis, BoundaryFlag } from './alignmentAnalysis';
import {
  computeChapterStats,
  describeStatsSummary,
  fragmentTexts,
  normalizeText,
  textByElementId,
} from './fragmentStats';

const fragment = (id: string, start: number, end: number, overrides: Partial<SMILFragment> = {}): SMILFragment => ({
  id,
  textSrc: `ch.xhtml#${id}`,
  audioSrc: 'a.mp3',
  clipBegin: start,
  clipEnd: end,
  text: '',
  order: 0,
  ...overrides,
});

const texts = (entries: [string, string][]) => new Map(entries);

const boundary = (id: string, overrides: Partial<BoundaryFlag> = {}): BoundaryFlag => ({
  id,
  index: 0,
  time: 0,
  db: -10,
  suggestedTime: null,
  shiftMs: null,
  ...overrides,
});

const alignment = (flagged: BoundaryFlag[], overrides: Partial<AlignmentAnalysis> = {}): AlignmentAnalysis => ({
  bestOffsetSeconds: 0,
  cutBefore: flagged.length,
  cutAfter: flagged.length,
  total: 10,
  flagged,
  marginal: [],
  speechLevelDb: -18,
  cutThresholdDb: -30,
  ...overrides,
});

describe('normalizeText', () => {
  it('collapses whitespace from markup', () => {
    expect(normalizeText('  a\n  b\tc  ')).toBe('a b c');
  });
});

describe('text resolution', () => {
  const resolve = (html: string, fragments: { id: string; textSrc: string }[]) =>
    fragmentTexts(fragments, textByElementId(html));

  it('resolves each fragment from the id in its textSrc', () => {
    const html = `<html><body><p><span id="a">First <em>sentence</em>.</span><span id="b">Second.</span></p></body></html>`;
    const result = resolve(html, [
      { id: 'f1', textSrc: 'ch.xhtml#a' },
      { id: 'f2', textSrc: 'ch.xhtml#b' },
    ]);
    expect(result.get('f1')).toBe('First sentence.');
    expect(result.get('f2')).toBe('Second.');
  });

  it('returns empty text for ids that are not in the chapter', () => {
    const result = resolve('<html><body></body></html>', [
      { id: 'f1', textSrc: 'ch.xhtml#missing' },
      { id: 'f2', textSrc: 'no-hash' },
    ]);
    expect(result.get('f1')).toBe('');
    expect(result.get('f2')).toBe('');
  });

  it('treats an empty chapter as all-missing', () => {
    const result = resolve('', [{ id: 'f1', textSrc: 'ch.xhtml#a' }]);
    expect(result.get('f1')).toBe('');
  });
});

describe('computeChapterStats', () => {
  it('reports duration and leaves a sound fragment unflagged', () => {
    const { rows, summary } = computeChapterStats([fragment('f1', 2, 4)], texts([['f1', 'abcdefgh']]));

    expect(rows).toHaveLength(1);
    expect(rows[0].duration).toBe(2);
    expect(rows[0].start).toBe(2);
    expect(rows[0].end).toBe(4);
    expect(rows[0].flags).toEqual([]);
    expect(summary.flagged).toBe(0);
  });

  it('flags invalid timing', () => {
    const { rows } = computeChapterStats([fragment('f1', 5, 5)], texts([['f1', 'abcdefgh']]));

    expect(rows[0].flags.map((flag) => flag.kind)).toContain('invalid-timing');
  });

  it('flags fragments that overlap earlier audio', () => {
    const { rows } = computeChapterStats([fragment('f1', 0, 5), fragment('f2', 3, 6)], texts([]));

    const overlap = rows[1].flags.find((flag) => flag.kind === 'overlap');
    expect(overlap?.severity).toBe('error');
    expect(overlap?.message).toBe('Overlaps fragment 1 by 2000ms');
    expect(rows[0].flags.some((flag) => flag.kind === 'overlap')).toBe(false);
  });

  it('does not flag shared boundaries or sub-50ms rounding noise as overlaps', () => {
    const fragments = [fragment('f1', 0, 5), fragment('f2', 4.96, 6), fragment('f3', 6, 7)];
    const { rows } = computeChapterStats(fragments, texts([]));

    expect(rows.every((row) => !row.flags.some((flag) => flag.kind === 'overlap'))).toBe(true);
  });

  it('names the fragment whose audio is overlapped, even when it is not the previous row', () => {
    const fragments = [fragment('f1', 0, 10), fragment('f2', 1, 2), fragment('f3', 3, 4)];
    const { rows } = computeChapterStats(fragments, texts([]));

    const messages = rows[2].flags
      .filter((flag) => flag.kind === 'overlap')
      .map((flag) => flag.message);
    expect(messages).toEqual(['Overlaps fragment 1 by 7000ms']);
  });

  it('does not compare timings when the chapter has no shared timeline', () => {
    const fragments = [fragment('f1', 0, 5), fragment('f2', 2, 8)];
    const { rows } = computeChapterStats(fragments, texts([]), { hasSharedTimeline: false });

    expect(rows.every((row) => !row.flags.some((flag) => flag.kind === 'overlap'))).toBe(true);
  });

  it('counts overlaps as errors in the summary', () => {
    const { summary } = computeChapterStats([fragment('f1', 0, 5), fragment('f2', 3, 6)], texts([]));

    expect(summary.errors).toBe(1);
  });

  it('flags fragments with no text in the chapter', () => {
    const { rows } = computeChapterStats([fragment('f1', 0, 2)], texts([]));

    expect(rows[0].flags.map((flag) => flag.kind)).toContain('missing-text');
    expect(rows[0].flags.find((flag) => flag.kind === 'missing-text')?.severity).toBe('warning');
  });

  it('flags boundaries the audio analysis says cut through speech', () => {
    const fragments = [fragment('f1', 0, 2), fragment('f2', 2, 4)];
    const { rows } = computeChapterStats(fragments, texts([['f1', 'abcdefgh'], ['f2', 'abcdefgh']]), {
      alignment: alignment([boundary('f2', { time: 2, suggestedTime: 2.195, shiftMs: 195 })]),
    });

    const cut = rows[1].flags.find((flag) => flag.kind === 'cuts-speech');
    expect(cut?.severity).toBe('warning');
    expect(cut?.shiftSeconds).toBeCloseTo(0.195);
    expect(cut?.message).toContain('195ms later');
    expect(rows[0].flags).toEqual([]);
  });

  it('reports a boundary with no pause nearby as needing a listen', () => {
    const { rows } = computeChapterStats([fragment('f1', 0, 2)], texts([['f1', 'abcdefgh']]), {
      alignment: alignment([boundary('f1', { time: 0, suggestedTime: null, shiftMs: null })]),
    });

    const cut = rows[0].flags.find((flag) => flag.kind === 'cuts-speech');
    expect(cut?.severity).toBe('error');
    expect(cut?.shiftSeconds).toBeUndefined();
    expect(cut?.message).toContain('needs a listen');
  });

  it('summarises errors and warnings separately', () => {
    const fragments = [fragment('f1', 0, 2), fragment('f2', 2, 4)];
    const { summary } = computeChapterStats(fragments, texts([['f2', 'abcdefgh']]), {
      alignment: alignment([boundary('f2', { suggestedTime: 2.1, shiftMs: 100 })]),
    });

    expect(summary.total).toBe(2);
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(2);
    expect(summary.flagged).toBe(2);
  });
});

describe('describeStatsSummary', () => {
  it('describes a clean chapter', () => {
    expect(describeStatsSummary({ total: 10, flagged: 0, errors: 0, warnings: 0 })).toBe(
      '10 fragments — nothing looks wrong'
    );
  });

  it('describes flagged fragments', () => {
    expect(describeStatsSummary({ total: 10, flagged: 3, errors: 1, warnings: 2 })).toBe(
      '3 of 10 flagged'
    );
  });

  it('handles an empty chapter', () => {
    expect(describeStatsSummary({ total: 0, flagged: 0, errors: 0, warnings: 0 })).toBe('No fragments');
  });
});
