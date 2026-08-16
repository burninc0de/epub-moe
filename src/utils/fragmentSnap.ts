import { SMILFragment } from '../types/epub';

export const snapFragmentBoundaries = (
  fragments: SMILFragment[],
  index: number,
  newStart: number,
  newEnd: number
): SMILFragment[] => {
  const updated = [...fragments];
  updated[index] = { ...updated[index], clipBegin: newStart, clipEnd: newEnd };

  if (index > 0) {
    updated[index - 1] = { ...updated[index - 1], clipEnd: newStart };
  }

  if (index < updated.length - 1) {
    updated[index + 1] = { ...updated[index + 1], clipBegin: newEnd };
  }

  return updated;
};
