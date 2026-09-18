import { describe, it, expect } from 'vitest';
import {
  analyzeAlignment,
  boundariesFromFragments,
  computeEnvelope,
  countCutBoundaries,
  describeAnalysis,
  findBestOffset,
  type Boundary,
  type Envelope,
} from './alignmentAnalysis';

const SAMPLE_RATE = 8000;
const WINDOW_MS = 10;

/**
 * Synthetic speech: a tone burst followed by a silent gap, repeated with
 * deliberately irregular timing, plus trailing padding.
 *
 * Geometry is modelled on a real chapter: gaps of roughly 400-800ms (measured
 * 665-1005ms in practice) between bursts. Narrow gaps would exaggerate the
 * effect of a small offset error and make the fixture unrepresentative.
 *
 * Boundaries are placed the way a human aligns them: a short pre-roll before
 * speech resumes, not at the centre of the gap. Measured convention is about
 * 65ms before the pause ends.
 *
 * Caveat for anyone tightening these assertions: real onsets ramp up over tens
 * of milliseconds, while these are rectangular. The detector therefore behaves
 * slightly more conservatively here than on real audio, which is why the
 * recovery assertions below are tolerance-based rather than exact. Accuracy on
 * real chapters is checked separately against hand-aligned reference material.
 */
const PRE_ROLL = 0.065;

const makeAudio = (opts: { count?: number } = {}) => {
  const count = opts.count ?? 12;
  // Bursts are sentences: seconds of continuous speech, not blips. Short bursts
  // make the fixture ambiguous, because a shift larger than a burst can land
  // every boundary in the *next* gap just as well as back in its own.
  const gapFor = (i: number) => 0.4 + 0.4 * (((i * 7) % 5) / 4);
  const burstFor = (i: number) => 0.9 + 0.7 * (((i * 11) % 4) / 3);

  const bursts: number[] = [];
  const gaps: number[] = [];
  const starts: number[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    starts.push(cursor);
    bursts.push(burstFor(i));
    gaps.push(gapFor(i));
    cursor += burstFor(i) + gapFor(i);
  }

  const total = Math.ceil((cursor + 0.5) * SAMPLE_RATE);
  const samples = new Float32Array(total);
  const pauses: number[] = [];

  for (let i = 0; i < count; i++) {
    const start = Math.floor(starts[i] * SAMPLE_RATE);
    const burstEnd = Math.floor((starts[i] + bursts[i]) * SAMPLE_RATE);
    for (let s = start; s < burstEnd && s < total; s++) {
      // 220Hz tone at amplitude 0.5 -> about -9 dBFS RMS
      samples[s] = 0.5 * Math.sin((2 * Math.PI * 220 * s) / SAMPLE_RATE);
    }
    pauses.push(starts[i] + bursts[i] + gaps[i] - PRE_ROLL);
  }

  return { samples, pauses };
};

const boundariesAt = (times: number[]): Boundary[] => times.map((time, i) => ({ id: `f${i}`, time }));

const audioEnvelope = () => computeEnvelope(makeAudio().samples, SAMPLE_RATE, WINDOW_MS);

/** Hand-built envelope: rectangular speech runs on a quiet floor. */
const handEnvelope = (runs: Array<[number, number]>, seconds: number): Envelope => {
  const frames = Math.floor((seconds * 1000) / WINDOW_MS);
  const db = new Float32Array(frames).fill(-60);
  for (const [start, end] of runs) {
    const from = Math.floor((start * 1000) / WINDOW_MS);
    const to = Math.floor((end * 1000) / WINDOW_MS);
    for (let k = from; k < to && k < frames; k++) db[k] = -10;
  }
  return { db, windowMs: WINDOW_MS };
};

describe('computeEnvelope', () => {
  it('separates speech from silence by a wide margin', () => {
    const envelope = audioEnvelope();
    expect(Math.max(...envelope.db)).toBeGreaterThan(-12);
    expect(Math.min(...envelope.db)).toBeLessThan(-60);
  });

  it('produces one value per window', () => {
    const envelope = computeEnvelope(new Float32Array(SAMPLE_RATE), SAMPLE_RATE, WINDOW_MS);
    expect(envelope.db.length).toBe(100);
    expect(envelope.windowMs).toBe(WINDOW_MS);
  });

  it('handles fewer samples than one window', () => {
    expect(computeEnvelope(new Float32Array(3), SAMPLE_RATE, WINDOW_MS).db.length).toBe(0);
  });
});

describe('countCutBoundaries', () => {
  it('counts nothing when boundaries sit in the gaps', () => {
    const envelope = handEnvelope([[0, 0.5], [0.9, 1.4], [1.8, 2.3]], 3);
    // gap between run 1 and 2 is 0.5..0.9
    const cuts = countCutBoundaries(envelope, boundariesAt([0.8, 1.7]), 0, -40);
    expect(cuts).toBe(0);
  });

  it('counts boundaries that land inside speech', () => {
    const envelope = handEnvelope([[0, 0.5], [0.9, 1.4], [1.8, 2.3]], 3);
    const cuts = countCutBoundaries(envelope, boundariesAt([0.2, 1.1, 2.0]), 0, -40);
    expect(cuts).toBe(3);
  });
});

describe('findBestOffset', () => {
  it('leaves an already-aligned chapter at zero', () => {
    const { pauses } = makeAudio();
    expect(findBestOffset(audioEnvelope(), boundariesAt(pauses)).offsetSeconds).toBe(0);
  });

  it('does not nudge a chapter whose boundaries are already in the pauses', () => {
    const envelope = handEnvelope([[0, 0.5], [0.9, 1.4], [1.8, 2.3], [2.7, 3.2]], 4);
    const boundaries = boundariesAt([0.8, 1.7, 2.6]);
    expect(findBestOffset(envelope, boundaries).offsetSeconds).toBe(0);
  });

  it('moves the chapter back when the boundaries are late', () => {
    const { pauses } = makeAudio();
    const late = pauses.map((p) => p + 0.3);
    const result = findBestOffset(audioEnvelope(), boundariesAt(late));
    expect(result.offsetSeconds).toBeLessThan(-0.2);
    expect(result.offsetSeconds).toBeGreaterThanOrEqual(-0.6);
  });

  it('recovers a known shift within a step or two of the truth', () => {
    const { pauses } = makeAudio();
    const envelope = audioEnvelope();
    for (const shift of [0.1, 0.2, 0.3, 0.5]) {
      const result = findBestOffset(envelope, boundariesAt(pauses.map((p) => p + shift)));
      // Rectangular synthetic gaps make this conservative; real audio is tighter.
      expect(Math.abs(-result.offsetSeconds - shift)).toBeLessThan(0.15);
    }
  });

  it('is not dragged off by a few boundaries that no shift can fix', () => {
    const { pauses } = makeAudio();
    const envelope = audioEnvelope();
    const times = pauses.map((p) => p + 0.3);
    const withOutliers = [...times];
    withOutliers[2] -= 0.45; // stuck mid-burst whatever the offset
    withOutliers[7] -= 0.45;

    const clean = findBestOffset(envelope, boundariesAt(times)).offsetSeconds;
    const dirty = findBestOffset(envelope, boundariesAt(withOutliers)).offsetSeconds;
    // Two stubborn boundaries out of twelve must not move the chapter.
    expect(Math.abs(dirty - clean)).toBeLessThanOrEqual(0.03);
  });

  it('prefers the smaller shift when several offsets are equally quiet', () => {
    const envelope = handEnvelope([[0, 0.5], [1.2, 1.7], [2.4, 2.9]], 3.5);
    // The gap 0.5..1.2 is wide, so many offsets are quiet; zero must win.
    expect(findBestOffset(envelope, boundariesAt([1.1, 2.3])).offsetSeconds).toBe(0);
  });

  it('respects a narrow search window', () => {
    const { pauses } = makeAudio();
    const late = pauses.map((p) => p + 0.5);
    const result = findBestOffset(audioEnvelope(), boundariesAt(late), { maxOffsetSeconds: 0.2 });
    expect(Math.abs(result.offsetSeconds)).toBeLessThanOrEqual(0.2);
  });

  it('honours a coarser step', () => {
    const { pauses } = makeAudio();
    const late = pauses.map((p) => p + 0.3);
    const result = findBestOffset(audioEnvelope(), boundariesAt(late), { stepSeconds: 0.05 });
    expect(Math.abs((result.offsetSeconds * 1000) % 50)).toBeLessThan(1e-6);
  });
});

describe('analyzeAlignment', () => {
  it('reports a clean chapter as clean', () => {
    const { pauses } = makeAudio();
    const analysis = analyzeAlignment(audioEnvelope(), boundariesAt(pauses));
    expect(analysis.total).toBe(pauses.length);
    expect(analysis.cutBefore).toBe(0);
    expect(analysis.bestOffsetSeconds).toBe(0);
    expect(analysis.flagged).toEqual([]);
  });

  it('reports a late chapter and substantially reduces the cuts', () => {
    const { pauses } = makeAudio();
    const late = pauses.map((p) => p + 0.3);
    const analysis = analyzeAlignment(audioEnvelope(), boundariesAt(late));

    expect(analysis.cutBefore).toBeGreaterThanOrEqual(late.length - 1);
    expect(analysis.bestOffsetSeconds).toBeLessThan(0);
    // Not necessarily zero: the objective is robust, so it will trade a couple of
    // stubborn boundaries for landing the rest where they belong.
    expect(analysis.cutAfter).toBeLessThan(analysis.cutBefore / 2);
  });

  it('keeps flagged boundaries that no global shift can fix', () => {
    const { pauses } = makeAudio();
    const mixed = [...pauses];
    // Deep enough into the burst that it is genuinely inside speech. A few tens
    // of ms would be filtered as inaudible, which is the point of that filter.
    mixed[5] -= 0.5;
    const analysis = analyzeAlignment(audioEnvelope(), boundariesAt(mixed));
    expect(analysis.flagged.map((f) => f.id)).toContain('f5');
  });

  it('lists small offsets by default, because they do get nudged in review', () => {
    const { pauses } = makeAudio();
    const mixed = [...pauses];
    mixed[5] += 0.08; // just past the pause, ~15ms into speech
    const analysis = analyzeAlignment(audioEnvelope(), boundariesAt(mixed));
    expect(analysis.flagged.map((f) => f.id)).toContain('f5');
    expect(analysis.marginal).toEqual([]);
  });

  it('can divert small offsets into the marginal bucket if you ask it to', () => {
    const { pauses } = makeAudio();
    const mixed = [...pauses];
    mixed[5] += 0.08; // just past the pause
    const analysis = analyzeAlignment(audioEnvelope(), boundariesAt(mixed), { minFixMs: 40 });
    expect(analysis.flagged.map((f) => f.id)).not.toContain('f5');
    expect(analysis.marginal.map((f) => f.id)).toContain('f5');
  });

  it('reports no pause when none is within reach', () => {
    const envelope = handEnvelope([[0, 2.0], [3.0, 5.0]], 5.5);
    // Deep inside a two-second burst; the nearest pause is 0.9s away.
    const analysis = analyzeAlignment(envelope, boundariesAt([1.0]), { quietSearchSeconds: 0.5 });
    expect(analysis.flagged).toHaveLength(1);
    expect(analysis.flagged[0].suggestedTime).toBeNull();
    expect(analysis.flagged[0].shiftMs).toBeNull();
  });

  it('suggests a quieter position for a flagged boundary', () => {
    const { pauses } = makeAudio();
    const mixed = [...pauses];
    mixed[5] -= 0.5;
    const analysis = analyzeAlignment(audioEnvelope(), boundariesAt(mixed));

    const flag = analysis.flagged.find((f) => f.id === 'f5');
    expect(flag).toBeDefined();
    expect(flag!.db).toBeGreaterThan(analysis.cutThresholdDb);
    // Either it names a pause to move to, or it reports that there is none.
    if (flag!.shiftMs !== null) expect(Math.abs(flag!.shiftMs)).toBeGreaterThanOrEqual(40);
    else expect(flag!.suggestedTime).toBeNull();
  });

  it('returns an empty analysis for no boundaries', () => {
    const analysis = analyzeAlignment(audioEnvelope(), []);
    expect(analysis.total).toBe(0);
    expect(analysis.flagged).toEqual([]);
    expect(analysis.bestOffsetSeconds).toBe(0);
  });

  it('returns an empty analysis for an empty envelope', () => {
    const empty: Envelope = { db: new Float32Array(0), windowMs: WINDOW_MS };
    const analysis = analyzeAlignment(empty, boundariesAt([0, 1, 2]));
    expect(analysis.bestOffsetSeconds).toBe(0);
    expect(analysis.flagged).toEqual([]);
  });
});

describe('boundariesFromFragments', () => {
  it('maps fragment starts in order', () => {
    expect(
      boundariesFromFragments([
        { id: 'a', clipBegin: 0.5 },
        { id: 'b', clipBegin: 2.25 },
      ])
    ).toEqual([
      { id: 'a', time: 0.5 },
      { id: 'b', time: 2.25 },
    ]);
  });
});

describe('describeAnalysis', () => {
  const base = {
    bestOffsetSeconds: 0,
    cutBefore: 0,
    cutAfter: 0,
    total: 10,
    flagged: [],
    marginal: [],
    speechLevelDb: -10,
    cutThresholdDb: -22,
  };

  const flag = (id: string, suggestedTime: number | null = null) => ({
    id,
    index: 0,
    time: 1,
    db: -20,
    suggestedTime,
    shiftMs: suggestedTime === null ? null : -100,
  });

  it('calls a clean chapter good', () => {
    expect(describeAnalysis(base)).toMatch(/looks good/i);
  });

  it('describes a suggested shift with before/after counts', () => {
    const text = describeAnalysis({ ...base, bestOffsetSeconds: -0.35, cutBefore: 7, cutAfter: 0 });
    expect(text).toContain('-350ms');
    expect(text).toContain('7 → 0');
    expect(text).toMatch(/nothing left that needs a listen/i);
  });

  it('names the boundaries that still need attention after a shift', () => {
    const text = describeAnalysis({
      ...base,
      bestOffsetSeconds: -0.08,
      cutBefore: 75,
      cutAfter: 4,
      flagged: [flag('a')],
    });
    expect(text).toContain('-80ms');
    expect(text).toMatch(/1 still needs a listen/);
  });

  it('never claims problems it does not list', () => {
    // The regression this guards: summary said "3 still cut through speech"
    // while the list came back empty, leaving nothing to act on.
    const text = describeAnalysis({ ...base, cutBefore: 3, cutAfter: 3, marginal: [flag('a'), flag('b'), flag('c')] });
    expect(text).toMatch(/looks good/i);
    expect(text).not.toMatch(/still cut|already at the best offset/i);
    expect(text).toContain('3 of 10');
  });

  it('reports boundaries with no pause to move to', () => {
    const text = describeAnalysis({
      ...base,
      bestOffsetSeconds: -0.1,
      cutBefore: 9,
      cutAfter: 2,
      flagged: [flag('a', 1.5), flag('b', null)],
    });
    expect(text).toMatch(/2 still need a listen/i);
    expect(text).toMatch(/1 with no pause nearby/);
  });
});

describe('dead zone', () => {
  /**
   * Boundaries sit 100ms before the pause ends; the measured human convention is
   * about 65ms before. So this chapter is 35ms off — improvable on paper, and
   * below the threshold where churning a chapter is worth it.
   */
  const slightlyEarly = () => {
    const runs: Array<[number, number]> = [];
    for (let i = 0; i < 13; i++) runs.push([i * 1.0, i * 1.0 + 0.5]);
    const envelope = handEnvelope(runs, 13);
    const times: number[] = [];
    for (let i = 0; i < 12; i++) times.push(i * 1.0 + 1.0 - 0.1);
    return { envelope, boundaries: boundariesAt(times) };
  };

  it('treats a sub-threshold correction as no correction', () => {
    const { envelope, boundaries } = slightlyEarly();
    expect(findBestOffset(envelope, boundaries).offsetSeconds).toBe(0);
  });

  it('is a policy, not a limit: it can be tightened', () => {
    const { envelope, boundaries } = slightlyEarly();
    const result = findBestOffset(envelope, boundaries, { minShiftSeconds: 0 });
    expect(result.offsetSeconds).toBeGreaterThan(0);
    expect(Math.abs(result.offsetSeconds)).toBeLessThan(0.1);
  });

  it('honours a custom pre-roll', () => {
    const { envelope, boundaries } = slightlyEarly();
    // Boundaries sit ~90ms early once frames are quantised; asking for a 90ms
    // pre-roll means no move. Allow one frame of slack.
    const result = findBestOffset(envelope, boundaries, { preRollMs: 90, minShiftSeconds: 0 });
    expect(Math.abs(result.offsetSeconds)).toBeLessThanOrEqual(0.02);
  });

  it('still corrects a misalignment worth fixing', () => {
    const { pauses } = makeAudio();
    const envelope = audioEnvelope();
    const shifted = pauses.map((p) => p + 0.3);
    expect(findBestOffset(envelope, boundariesAt(shifted)).offsetSeconds).toBeLessThan(-0.05);
  });
});
