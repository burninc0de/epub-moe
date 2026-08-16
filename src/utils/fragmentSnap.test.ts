import { describe, it, expect } from 'vitest';
import { snapFragmentBoundaries } from './fragmentSnap';
import { SMILFragment } from '../types/epub';

const makeFragment = (id: string, begin: number, end: number): SMILFragment => ({
  id,
  textSrc: `chapter.xhtml#${id}`,
  audioSrc: 'audio.mp3',
  clipBegin: begin,
  clipEnd: end,
  text: id,
  order: 0,
});

describe('snapFragmentBoundaries', () => {
  it('updates the target fragment and snaps both neighbours', () => {
    const fragments = [
      makeFragment('a', 0, 1),
      makeFragment('b', 1, 2),
      makeFragment('c', 2, 3),
    ];

    const result = snapFragmentBoundaries(fragments, 1, 1.2, 2.2);

    expect(result[0].clipEnd).toBe(1.2);
    expect(result[1]).toEqual(expect.objectContaining({ clipBegin: 1.2, clipEnd: 2.2 }));
    expect(result[2].clipBegin).toBe(2.2);
  });

  it('only snaps the next neighbour for the first fragment', () => {
    const fragments = [makeFragment('a', 0, 1), makeFragment('b', 1, 2)];

    const result = snapFragmentBoundaries(fragments, 0, 0, 1.5);

    expect(result[0]).toEqual(expect.objectContaining({ clipBegin: 0, clipEnd: 1.5 }));
    expect(result[1].clipBegin).toBe(1.5);
  });

  it('only snaps the previous neighbour for the last fragment', () => {
    const fragments = [makeFragment('a', 0, 1), makeFragment('b', 1, 2)];

    const result = snapFragmentBoundaries(fragments, 1, 0.5, 2);

    expect(result[0].clipEnd).toBe(0.5);
    expect(result[1]).toEqual(expect.objectContaining({ clipBegin: 0.5, clipEnd: 2 }));
  });

  it('does not mutate the input array', () => {
    const fragments = [makeFragment('a', 0, 1), makeFragment('b', 1, 2)];
    snapFragmentBoundaries(fragments, 0, 0, 1.5);

    expect(fragments[0].clipEnd).toBe(1);
    expect(fragments[1].clipBegin).toBe(1);
  });
});
