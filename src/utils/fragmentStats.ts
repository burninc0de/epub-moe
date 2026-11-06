import { SMILFragment } from '../types/epub';
import type { AlignmentAnalysis } from './alignmentAnalysis';

export type FragmentFlagKind = 'invalid-timing' | 'overlap' | 'missing-text' | 'cuts-speech';

export interface FragmentFlag {
  kind: FragmentFlagKind;
  severity: 'error' | 'warning';
  message: string;
  /** For `cuts-speech`: how far to move the fragment's start, in seconds. */
  shiftSeconds?: number;
}

export interface FragmentRow {
  id: string;
  fragment: SMILFragment;
  index: number;
  text: string;
  start: number;
  end: number;
  duration: number;
  flags: FragmentFlag[];
}

export interface FragmentStatsSummary {
  total: number;
  flagged: number;
  errors: number;
  warnings: number;
}

export interface ChapterStats {
  rows: FragmentRow[];
  summary: FragmentStatsSummary;
}

export interface FragmentStatsOptions {
  /** Boundary analysis of the chapter audio. Pace alone is not evidence of a mistake. */
  alignment?: AlignmentAnalysis | null;
  /**
   * Overlaps smaller than this are rounding noise between adjacent boundaries,
   * not two fragments claiming the same audio. Default 0.05 (50ms).
   */
  overlapToleranceSeconds?: number;
}

/** Collapse markup-free whitespace so line breaks do not compound in the table. */
export const normalizeText = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Every id in the chapter mapped to its text.
 *
 * `SMILFragment.text` is never populated by the parser, so the chapter HTML is
 * the only place a fragment's words exist. Parsing once per chapter keeps this
 * off the path of timing edits, where the fragment list changes constantly.
 */
export const textByElementId = (chapterHtml: string): Map<string, string> => {
  const texts = new Map<string, string>();
  if (!chapterHtml) return texts;

  const doc = new DOMParser().parseFromString(chapterHtml, 'text/html');
  for (const element of Array.from(doc.querySelectorAll('[id]'))) {
    texts.set(element.id, normalizeText(element.textContent ?? ''));
  }
  return texts;
};

/** Each fragment's text, resolved from the id in its `textSrc`. */
export const fragmentTexts = (
  fragments: { id: string; textSrc: string }[],
  byElementId: Map<string, string>
): Map<string, string> => {
  const texts = new Map<string, string>();
  for (const fragment of fragments) {
    const elementId = fragment.textSrc.split('#')[1];
    texts.set(fragment.id, (elementId && byElementId.get(elementId)) || '');
  }
  return texts;
};

const cutFlag = (flag: AlignmentAnalysis['flagged'][number]): FragmentFlag => {
  if (flag.suggestedTime === null || flag.shiftMs === null) {
    return {
      kind: 'cuts-speech',
      severity: 'error',
      message: 'Boundary cuts through speech with no pause nearby — this one needs a listen',
    };
  }
  const shift = Math.round(flag.shiftMs);
  return {
    kind: 'cuts-speech',
    severity: 'warning',
    message: `Boundary cuts through speech — ${Math.abs(shift)}ms ${shift < 0 ? 'earlier' : 'later'} lands in the pause`,
    shiftSeconds: flag.shiftMs / 1000,
  };
};

/**
 * Timing and coverage per fragment.
 *
 * Only structural problems and boundaries the audio analysis says cut through
 * speech are flagged. There is deliberately no reading-rate metric: characters
 * per second is text length over a duration that the alignment itself produced,
 * so it can only measure its own input. A boundary in the middle of a word is
 * direct evidence; a short sentence is not.
 */
export const computeChapterStats = (
  fragments: SMILFragment[],
  texts: Map<string, string>,
  options: FragmentStatsOptions = {}
): ChapterStats => {
  const overlapTolerance = options.overlapToleranceSeconds ?? 0.05;
  const cutFlags = new Map(
    (options.alignment?.flagged ?? []).map((flag) => [flag.id, cutFlag(flag)] as const)
  );

  let furthestEnd = -Infinity;
  let furthestIndex = -1;

  const rows: FragmentRow[] = fragments.map((fragment, index) => {
    const text = texts.get(fragment.id) ?? '';
    const duration = fragment.clipEnd - fragment.clipBegin;
    const flags: FragmentFlag[] = [];

    if (duration <= 0) {
      flags.push({
        kind: 'invalid-timing',
        severity: 'error',
        message: 'End is not after start',
      });
    }

    if (fragment.clipBegin < furthestEnd - overlapTolerance) {
      flags.push({
        kind: 'overlap',
        severity: 'error',
        message: `Overlaps fragment ${furthestIndex + 1} by ${Math.round((furthestEnd - fragment.clipBegin) * 1000)}ms`,
      });
    }

    if (fragment.clipEnd > furthestEnd) {
      furthestEnd = fragment.clipEnd;
      furthestIndex = index;
    }

    if (text === '') {
      flags.push({
        kind: 'missing-text',
        severity: 'warning',
        message: 'No text in the chapter for this fragment',
      });
    }

    const cut = cutFlags.get(fragment.id);
    if (cut) flags.push(cut);

    return {
      id: fragment.id,
      fragment,
      index,
      text,
      start: fragment.clipBegin,
      end: fragment.clipEnd,
      duration,
      flags,
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      flagged: rows.filter((row) => row.flags.length > 0).length,
      errors: rows.filter((row) => row.flags.some((flag) => flag.severity === 'error')).length,
      warnings: rows.filter((row) => row.flags.some((flag) => flag.severity === 'warning')).length,
    },
  };
};

export const describeStatsSummary = (summary: FragmentStatsSummary): string => {
  if (summary.total === 0) return 'No fragments';
  if (summary.flagged === 0) return `${summary.total} fragments — nothing looks wrong`;
  return `${summary.flagged} of ${summary.total} flagged`;
};
