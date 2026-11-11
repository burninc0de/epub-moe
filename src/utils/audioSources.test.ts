import { describe, it, expect } from 'vitest';
import { distinctAudioSources, playsMultipleAudioFiles } from './audioSources';
import { SMILFragment } from '../types/epub';

const fragment = (audioSrc: string, order = 0): SMILFragment => ({
  id: `smil1::p${order}`,
  textSrc: 'chapter1.xhtml#t1',
  audioSrc,
  clipBegin: 0,
  clipEnd: 1,
  text: '',
  order,
});

describe('distinctAudioSources', () => {
  it('returns one source for a single-file chapter', () => {
    const fragments = [fragment('../Audio/a.mp3', 0), fragment('../Audio/a.mp3', 1)];
    expect(distinctAudioSources(fragments)).toEqual(['../Audio/a.mp3']);
  });

  it('returns both sources when the chapter switches files', () => {
    const fragments = [fragment('../Audio/a.mp3', 0), fragment('../Audio/b.mp3', 1)];
    expect(distinctAudioSources(fragments)).toEqual(['../Audio/a.mp3', '../Audio/b.mp3']);
  });

  it('counts the same file once however it is spelled', () => {
    const fragments = [
      fragment('../Audio/a.mp3', 0),
      fragment('../Audio/./a.mp3', 1),
      fragment('../Audio/sub/../a.mp3', 2),
    ];
    expect(distinctAudioSources(fragments)).toEqual(['../Audio/a.mp3']);
  });

  it('keeps files with the same name in different folders apart', () => {
    const fragments = [fragment('../Audio/one/a.mp3', 0), fragment('../Audio/two/a.mp3', 1)];
    expect(distinctAudioSources(fragments)).toHaveLength(2);
  });

  it('ignores fragment identifiers on the source', () => {
    const fragments = [fragment('../Audio/a.mp3#t=10', 0), fragment('../Audio/a.mp3', 1)];
    expect(distinctAudioSources(fragments)).toEqual(['../Audio/a.mp3']);
  });
});

describe('playsMultipleAudioFiles', () => {
  it('is false for one file', () => {
    expect(playsMultipleAudioFiles([fragment('../Audio/a.mp3')])).toBe(false);
  });

  it('is true once a second file appears', () => {
    expect(playsMultipleAudioFiles([fragment('../Audio/a.mp3', 0), fragment('../Audio/b.mp3', 1)])).toBe(true);
  });

  it('is false for a chapter with no fragments', () => {
    expect(playsMultipleAudioFiles([])).toBe(false);
  });
});
