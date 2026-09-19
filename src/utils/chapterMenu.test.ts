import { describe, it, expect } from 'vitest';
import { chapterMenuActions, derivedTitle, type MenuChapter } from './chapterMenu';

const audio = (over: Partial<MenuChapter> = {}): MenuChapter => ({
  title: '1. Frühstück',
  href: 'Text/Kapitel01.html',
  hasAudio: true,
  ...over,
});

describe('derivedTitle', () => {
  it('returns a heading when one was found', () => {
    expect(derivedTitle(audio())).toBe('1. Frühstück');
  });

  it('returns null when the label fell back to the file path', () => {
    expect(derivedTitle(audio({ title: 'Text/Kapitel01.html' }))).toBeNull();
  });

  it('returns null for an empty title', () => {
    expect(derivedTitle(audio({ title: '' }))).toBeNull();
  });
});

describe('chapterMenuActions', () => {
  it('offers the finished toggle and both copies for an audio chapter', () => {
    expect(chapterMenuActions(audio(), false).map(a => a.id)).toEqual([
      'toggle-done',
      'copy-title',
      'copy-filename',
    ]);
  });

  it('hides the toggle once finished, and offers the reverse', () => {
    const actions = chapterMenuActions(audio(), true);
    expect(actions[0]).toMatchObject({ id: 'toggle-done', label: 'Mark as not finished' });
    const pending = chapterMenuActions(audio(), false);
    expect(pending[0]).toMatchObject({ id: 'toggle-done', label: 'Mark as finished' });
  });

  it('omits the finished toggle for a chapter without audio', () => {
    expect(chapterMenuActions(audio({ hasAudio: false }), false).map(a => a.id)).toEqual([
      'copy-title',
      'copy-filename',
    ]);
  });

  it('omits Copy title when there is no heading to copy', () => {
    const actions = chapterMenuActions(audio({ title: 'Text/Kapitel01.html' }), false);
    expect(actions.map(a => a.id)).toEqual(['toggle-done', 'copy-filename']);
  });

  it('still offers Copy file name when that is the only thing available', () => {
    const actions = chapterMenuActions(
      { title: 'Text/Kapitel01.html', href: 'Text/Kapitel01.html', hasAudio: false },
      false
    );
    expect(actions).toEqual([{ id: 'copy-filename', label: 'Copy file name', copyText: 'Text/Kapitel01.html' }]);
  });

  it('copies the heading, not the file path, for Copy title', () => {
    const action = chapterMenuActions(audio(), false).find(a => a.id === 'copy-title');
    expect(action?.copyText).toBe('1. Frühstück');
  });

  it('copies the full path for Copy file name', () => {
    const action = chapterMenuActions(audio(), false).find(a => a.id === 'copy-filename');
    expect(action?.copyText).toBe('Text/Kapitel01.html');
  });

  it('never yields an empty menu', () => {
    expect(
      chapterMenuActions({ title: '', href: 'a.html', hasAudio: false }, false).length
    ).toBeGreaterThan(0);
  });
});
