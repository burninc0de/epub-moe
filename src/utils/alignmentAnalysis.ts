/**
 * Automatic calibration of SMIL fragment boundaries against audio energy.
 *
 * The problem this solves: an auto-aligner can produce a chapter whose
 * boundaries are all late (or early) by the same constant. Reading-rate
 * statistics do not reveal this — a misaligned chapter and a hand-aligned one
 * have the same words-per-minute distribution. What differs is *where the
 * boundaries land in the audio*: a correct boundary falls in the pause between
 * speech, a wrong one cuts through the middle of a word.
 *
 * So we measure the audio instead of guessing from the text:
 *
 *   1. Reduce the audio to a dB envelope over short windows.
 *   2. Score every candidate global offset by how many boundaries sit in loud
 *      speech at that offset.
 *   3. Report the offset that minimises those cuts, and the boundaries that are
 *      still cutting after applying it.
 *
 * Measured on a real 10-chapter book: hand-aligned chapters score 0-4% cut
 * boundaries, an auto-aligned one scored 63% and dropped to 0% after a single
 * -350ms shift. The residual after the shift is what actually needs a human.
 */

/** One SMIL boundary: the start of a fragment, and which fragment it belongs to. */
export interface Boundary {
  id: string;
  time: number;
}

export interface Envelope {
  /** RMS level in dBFS, one value per window. */
  db: Float32Array;
  /** Window length in seconds. */
  windowMs: number;
}

export interface AlignmentOptions {
  /** How far to search for a global offset, in seconds. Default 0.6. */
  maxOffsetSeconds?: number;
  /** Offset search granularity, in seconds. Default 0.01 (10ms). */
  stepSeconds?: number;
  /**
   * A boundary is "cutting speech" when it is within this many dB of the chapter's
   * typical speech level. Default 12.
   */
  cutBelowDb?: number;
  /** Percentile of the envelope treated as the speech level. Default 75. */
  speechPercentile?: number;
  /**
   * Where in the pause a boundary belongs: this many ms before speech resumes.
   * Default 65.
   *
   * This is measured from hand-aligned reference chapters, which consistently
   * place boundaries 50-80ms before the end of the pause — a short pre-roll on
   * the next word. It is NOT the quietest point in the pause, so objectives that
   * minimise energy will always drift earlier than a human would put them.
   */
  preRollMs?: number;
  /**
   * An offset is only considered if at least this fraction of boundaries land in
   * a pause at that offset. Default 0.6. Without it, an offset that shoves most
   * boundaries into speech could still score well on the few that remain quiet.
   */
  minQuietFraction?: number;
  /**
   * The shortest run of quiet that counts as a pause, in ms. Default 60.
   * Shorter dips are transients inside speech, not sentence boundaries.
   */
  minPauseMs?: number;
  /**
   * Only report a boundary as needing attention if it sits at least this many ms
   * inside speech. Default 0 — report everything that has a real pause to move
   * to.
   *
   * Kept as an escape hatch, not as a default: in review these small offsets do
   * get nudged, so hiding them just means the tool disagrees with the person
   * using it. The filter that actually removes noise is `minPauseMs`; before it
   * existed this list was full of 10-20ms "fixes" that snapped boundaries onto
   * one-frame transients instead of pauses.
   */
  minFixMs?: number;
  /**
   * Corrections smaller than this are reported as no correction, in seconds.
   * Default 0.05 (50ms).
   *
   * Hand-aligned chapters can still score marginally better a few tens of ms
   * earlier. Churning a chapter for 30ms is not worth it and makes the tool
   * claim work is needed where a human sees nothing wrong.
   */
  minShiftSeconds?: number;
  /** Search radius for a nearby quiet spot when suggesting a shift, in seconds. Default 0.6. */
  quietSearchSeconds?: number;
}

export interface BoundaryFlag {
  id: string;
  index: number;
  /** The boundary's current position, in seconds. */
  time: number;
  /** Level at the boundary, in dBFS. */
  db: number;
  /**
   * Where the nearest real pause says the boundary should go, in seconds, or
   * null when there is no pause worth moving to nearby — which is the case that
   * genuinely needs a human ear.
   */
  suggestedTime: number | null;
  /** How far the boundary should move, in milliseconds. null when no pause was found. */
  shiftMs: number | null;
}

export interface AlignmentAnalysis {
  /** Suggested global shift, in seconds. 0 means the chapter is already aligned. */
  bestOffsetSeconds: number;
  /** Boundaries cutting speech at the current positions. */
  cutBefore: number;
  /** Boundaries cutting speech after applying `bestOffsetSeconds`. */
  cutAfter: number;
  total: number;
  /** Boundaries still cutting after the shift — these need a human. */
  flagged: BoundaryFlag[];
  /**
   * Boundaries that cross the cut threshold but were filtered out by `minFixMs`.
   * Empty by default, since nothing is filtered unless you ask for it.
   */
  marginal: BoundaryFlag[];
  /** The chapter's typical level during speech, in dBFS. */
  speechLevelDb: number;
  /** Anything at or above this level counts as speech. */
  cutThresholdDb: number;
}

/**
 * RMS envelope of mono samples, in dBFS.
 *
 * The +1e-9 avoids log(0) and clamps the floor around -180dB, which is well
 * below anything audible, so it never affects a speech/quiet decision.
 */
export const computeEnvelope = (samples: Float32Array, sampleRate: number, windowMs = 10): Envelope => {
  const windowSize = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const frames = Math.floor(samples.length / windowSize);
  const db = new Float32Array(frames);

  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * windowSize;
    for (let i = start; i < start + windowSize; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / windowSize);
    db[f] = 20 * Math.log10(rms + 1e-9);
  }

  return { db, windowMs };
};

/**
 * Envelope of a decoded audio buffer, downmixed to mono without materialising a
 * mono copy — chapters are minutes long and the extra allocation is wasteful.
 */
export const envelopeFromAudioBuffer = (buffer: AudioBuffer, windowMs = 10): Envelope => {
  const windowSize = Math.max(1, Math.round((windowMs / 1000) * buffer.sampleRate));
  const channels = buffer.numberOfChannels;
  const frames = Math.floor(buffer.length / windowSize);
  const db = new Float32Array(frames);

  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * windowSize;
    for (let i = start; i < start + windowSize; i++) {
      let v = 0;
      for (let c = 0; c < channels; c++) v += data[c][i];
      v /= channels;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / windowSize);
    db[f] = 20 * Math.log10(rms + 1e-9);
  }

  return { db, windowMs };
};

/** Level at a boundary time, clamped to the envelope. */
const levelAt = (envelope: Envelope, time: number): number => {
  const { db, windowMs } = envelope;
  if (db.length === 0) return -Infinity;
  const index = Math.floor(time / (windowMs / 1000));
  if (index < 0) return db[0];
  if (index >= db.length) return db[db.length - 1];
  return db[index];
};

/**
 * How many boundaries sit in speech at a given global offset.
 * This is the whole scoring function: lower is better.
 */
export const countCutBoundaries = (
  envelope: Envelope,
  boundaries: Boundary[],
  offsetSeconds: number,
  cutThresholdDb: number
): number => {
  let cuts = 0;
  for (const b of boundaries) {
    if (levelAt(envelope, b.time + offsetSeconds) > cutThresholdDb) cuts++;
  }
  return cuts;
};

const percentileOf = (values: ArrayLike<number>, percentile: number): number => {
  if (values.length === 0) return -Infinity;
  const sorted = Float32Array.from(values).sort();
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((percentile / 100) * sorted.length)));
  return sorted[index];
};

const medianOf = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Distance from a boundary to the end of the pause it sits in, or null when the
 * boundary is in speech. "End of the pause" is where the next word starts.
 */
const distanceToPauseEnd = (envelope: Envelope, time: number, cutThresholdDb: number): number | null => {
  const { db, windowMs } = envelope;
  const step = windowMs / 1000;
  const k = Math.floor(time / step);
  if (k < 0 || k >= db.length) return null;
  if (db[k] >= cutThresholdDb) return null;
  let end = k;
  while (end < db.length - 1 && db[end + 1] < cutThresholdDb) end++;
  return (end - k) * step;
};

/**
 * Find the global offset that places boundaries where a human would put them.
 *
 * Earlier attempts scored offsets by audio energy — first by counting boundaries
 * that cut through speech, then by a robust percentile of the level at each
 * boundary. Both are wrong for this job, for the same reason: a human does not
 * put a boundary at the quietest point of the pause. They put it shortly before
 * speech resumes, so that nothing is clipped and the next fragment starts clean.
 * Measured across hand-aligned chapters, that is 50-80ms before the pause ends.
 *
 * Energy objectives therefore always want to drag boundaries earlier than a human
 * would, and the count objective additionally lets a couple of stubborn
 * boundaries pull the whole chapter with them.
 *
 * So: for each candidate offset, measure how far each boundary sits from the end
 * of its pause, and pick the offset whose median lands on the pre-roll. Ties go
 * to the smallest shift.
 */
export const findBestOffset = (
  envelope: Envelope,
  boundaries: Boundary[],
  options: AlignmentOptions = {}
): { offsetSeconds: number; cutCount: number; cutThresholdDb: number; speechLevelDb: number } => {
  const maxOffset = options.maxOffsetSeconds ?? 0.6;
  const step = options.stepSeconds ?? 0.01;
  const cutBelow = options.cutBelowDb ?? 12;
  const percentile = options.speechPercentile ?? 75;
  const preRoll = (options.preRollMs ?? 65) / 1000;
  const minQuiet = options.minQuietFraction ?? 0.6;
  const minShift = options.minShiftSeconds ?? 0.05;

  const speechLevelDb = percentileOf(envelope.db, percentile);
  const cutThresholdDb = speechLevelDb - cutBelow;

  if (boundaries.length === 0 || envelope.db.length === 0) {
    return { offsetSeconds: 0, cutCount: 0, cutThresholdDb, speechLevelDb };
  }

  const steps = Math.round(maxOffset / step);
  let chosen: number | null = null;
  let bestError = Infinity;

  for (let s = -steps; s <= steps; s++) {
    const offset = s * step;
    const distances: number[] = [];
    for (const b of boundaries) {
      const d = distanceToPauseEnd(envelope, b.time + offset, cutThresholdDb);
      if (d !== null) distances.push(d);
    }
    if (distances.length < minQuiet * boundaries.length) continue;

    const error = Math.abs(medianOf(distances) - preRoll);
    const better =
      error < bestError - 1e-9 ||
      (Math.abs(error - bestError) < 1e-9 && chosen !== null && Math.abs(offset) < Math.abs(chosen));
    if (better) {
      bestError = error;
      chosen = offset;
    }
  }

  const offsetSeconds = chosen !== null && Math.abs(chosen) >= minShift ? chosen : 0;
  return {
    offsetSeconds,
    cutCount: countCutBoundaries(envelope, boundaries, offsetSeconds, cutThresholdDb),
    cutThresholdDb,
    speechLevelDb,
  };
};

/**
 * Nearest real pause to a boundary, expressed as the position a human would put
 * the marker (the pause's end, backed off by the pre-roll) together with how far
 * the boundary currently sits inside speech.
 *
 * Searches outwards so the closest pause wins, and requires the pause to last at
 * least `minPauseMs` — a one-frame dip in the envelope is a transient, not a
 * sentence boundary, and snapping to one produces meaningless 10ms "fixes".
 * Returns null when nothing nearby qualifies.
 */
const nearestPausePlacement = (
  envelope: Envelope,
  time: number,
  cutThresholdDb: number,
  searchSeconds: number,
  minPauseMs: number,
  preRollSeconds: number
): { suggestedTime: number; intoSpeechMs: number } | null => {
  const { db, windowMs } = envelope;
  const step = windowMs / 1000;
  const center = Math.floor(time / step);
  const radius = Math.round(searchSeconds / step);
  const minFrames = Math.max(1, Math.round(minPauseMs / windowMs));

  for (let d = 0; d <= radius; d++) {
    for (const i of d === 0 ? [center] : [center - d, center + d]) {
      if (i < 0 || i >= db.length) continue;
      if (db[i] >= cutThresholdDb) continue;
      let end = i;
      while (end < db.length - 1 && db[end + 1] < cutThresholdDb) end++;
      let start = i;
      while (start > 0 && db[start - 1] < cutThresholdDb) start--;
      if (end - start + 1 < minFrames) continue;
      const suggestedTime = end * step - preRollSeconds;
      // A pause can be found yet sit far from the boundary — typically one that
      // *follows* it, whose end is then a long way off. Suggesting a 1.3s move is
      // not a suggestion; report it as needing a listen instead.
      if (Math.abs(suggestedTime - time) > searchSeconds) continue;
      return { suggestedTime, intoSpeechMs: d * windowMs };
    }
  }
  return null;
};

/**
 * Full calibration report for one chapter.
 *
 * `boundaries` should be the fragment start times. Pass the envelope from
 * `envelopeFromAudioBuffer` (browser) or `computeEnvelope` (tests).
 */
export const analyzeAlignment = (
  envelope: Envelope,
  boundaries: Boundary[],
  options: AlignmentOptions = {}
): AlignmentAnalysis => {
  const quietSearch = options.quietSearchSeconds ?? 0.6;
  const minPauseMs = options.minPauseMs ?? 60;
  const minFixMs = options.minFixMs ?? 0;
  const preRoll = (options.preRollMs ?? 65) / 1000;

  if (boundaries.length === 0 || envelope.db.length === 0) {
    return {
      bestOffsetSeconds: 0,
      cutBefore: 0,
      cutAfter: 0,
      total: boundaries.length,
      flagged: [],
      marginal: [],
      speechLevelDb: -Infinity,
      cutThresholdDb: -Infinity,
    };
  }

  const { offsetSeconds, cutThresholdDb, speechLevelDb } = findBestOffset(envelope, boundaries, options);
  const cutBefore = countCutBoundaries(envelope, boundaries, 0, cutThresholdDb);
  const cutAfter = countCutBoundaries(envelope, boundaries, offsetSeconds, cutThresholdDb);

  const flagged: BoundaryFlag[] = [];
  const marginal: BoundaryFlag[] = [];
  boundaries.forEach((b, index) => {
    const time = b.time + offsetSeconds;
    const db = levelAt(envelope, time);
    if (db <= cutThresholdDb) return;

    const placement = nearestPausePlacement(envelope, time, cutThresholdDb, quietSearch, minPauseMs, preRoll);
    const entry: BoundaryFlag = {
      id: b.id,
      index,
      time: b.time,
      db,
      suggestedTime: placement?.suggestedTime ?? null,
      shiftMs: placement === null ? null : (placement.suggestedTime - time) * 1000,
    };

    // `minFixMs` defaults to 0, so everything with a real pause to move to is
    // actionable. A non-zero threshold diverts the small ones here instead.
    if (placement !== null && placement.intoSpeechMs < minFixMs) marginal.push(entry);
    else flagged.push(entry);
  });

  return {
    bestOffsetSeconds: offsetSeconds,
    cutBefore,
    cutAfter,
    total: boundaries.length,
    flagged,
    marginal,
    speechLevelDb,
    cutThresholdDb,
  };
};

/** Fragment start times as boundaries, in their existing order. */
export const boundariesFromFragments = (fragments: { id: string; clipBegin: number }[]): Boundary[] =>
  fragments.map((f) => ({ id: f.id, time: f.clipBegin }));

/**
 * A short, human-readable verdict for the UI.
 *
 * The wording has to agree with the list rendered underneath it. Reporting "3
 * still cut through speech" beside an empty list leaves the reader hunting for
 * boundaries the tool has decided not to name.
 */
export const describeAnalysis = (analysis: AlignmentAnalysis): string => {
  const { bestOffsetSeconds, cutBefore, cutAfter, total, flagged, marginal } = analysis;
  const pct = (n: number) => (total ? Math.round((100 * n) / total) : 0);
  const shiftMs = Math.round(bestOffsetSeconds * 1000);
  const actionable = flagged.length;
  const noPause = flagged.filter((f) => f.suggestedTime === null).length;

  const residual =
    actionable === 0
      ? ' Nothing left that needs a listen.'
      : ` ${actionable} still need${actionable === 1 ? 's' : ''} a listen${noPause ? ` (${noPause} with no pause nearby)` : ''}.`;

  if (shiftMs !== 0) {
    return (
      `Shift everything by ${shiftMs > 0 ? '+' : ''}${shiftMs}ms: ` +
      `${cutBefore} → ${cutAfter} of ${total} boundaries cutting speech ` +
      `(${pct(cutBefore)}% → ${pct(cutAfter)}%).${residual}`
    );
  }

  if (actionable === 0) {
    const marginalNote =
      marginal.length > 0
        ? ` ${marginal.length} of ${total} sit marginally close to speech, none worth changing.`
        : '';
    return `Alignment looks good.${marginalNote}`;
  }

  return `${actionable} of ${total} boundaries need a manual listen.${noPause ? ` ${noPause} have no pause nearby.` : ''}`;
};
