import { SMILFragment } from '../types/epub';

/** Collapses `.` and `..` segments so the same file spelled two ways counts once. */
const collapsePath = (src: string): string => {
  const segments = src.split('#')[0].split('/');
  const resolved: string[] = [];

  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..' && resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }

  return resolved.join('/');
};

export const distinctAudioSources = (fragments: SMILFragment[]): string[] =>
  [...new Set(fragments.map((fragment) => collapsePath(fragment.audioSrc)).filter(Boolean))];

/**
 * A chapter may legally play several audio files, but epub-moe only ever loads
 * the one the first fragment points at.
 */
export const playsMultipleAudioFiles = (fragments: SMILFragment[]): boolean =>
  distinctAudioSources(fragments).length > 1;
