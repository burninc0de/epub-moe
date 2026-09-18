import { describe, it, expect } from 'vitest';
import {
  readDoneChapters,
  storageKeyFor,
  toggleDoneChapter,
  writeDoneChapters,
  type StorageLike,
} from './chapterProgress';

const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

describe('chapterProgress', () => {
  it('namespaces the key by book title', () => {
    expect(storageKeyFor('Some Book')).toBe('chapterProgress:Some Book');
  });

  it('starts empty', () => {
    expect(readDoneChapters('Test Book', fakeStorage())).toEqual(new Set());
  });

  it('round-trips marked chapters', () => {
    const storage = fakeStorage();
    writeDoneChapters('Test Book', new Set(['a.html', 'b.html']), storage);
    expect(readDoneChapters('Test Book', storage)).toEqual(new Set(['a.html', 'b.html']));
  });

  it('keeps books separate', () => {
    const storage = fakeStorage();
    writeDoneChapters('Book One', new Set(['a.html']), storage);
    writeDoneChapters('Book Two', new Set(['b.html']), storage);
    expect(readDoneChapters('Book One', storage)).toEqual(new Set(['a.html']));
    expect(readDoneChapters('Book Two', storage)).toEqual(new Set(['b.html']));
  });

  it('toggles a chapter on and off', () => {
    const storage = fakeStorage();
    const first = toggleDoneChapter('Test Book', new Set(), 'a.html', storage);
    expect(first).toEqual(new Set(['a.html']));
    expect(readDoneChapters('Test Book', storage)).toEqual(new Set(['a.html']));

    const second = toggleDoneChapter('Test Book', first, 'a.html', storage);
    expect(second).toEqual(new Set());
    expect(readDoneChapters('Test Book', storage)).toEqual(new Set());
  });

  it('does not mutate the set it was given', () => {
    const before = new Set(['a.html']);
    toggleDoneChapter('Test Book', before, 'b.html', fakeStorage());
    expect(before).toEqual(new Set(['a.html']));
  });

  it('survives corrupt stored data', () => {
    expect(readDoneChapters('Test Book', fakeStorage({ 'chapterProgress:Test Book': 'not json' }))).toEqual(new Set());
    expect(readDoneChapters('Test Book', fakeStorage({ 'chapterProgress:Test Book': '{"a":1}' }))).toEqual(new Set());
  });

  it('ignores non-string entries', () => {
    const storage = fakeStorage({ 'chapterProgress:Test Book': '["a.html", 3, null, ""]' });
    expect(readDoneChapters('Test Book', storage)).toEqual(new Set(['a.html']));
  });

  it('is a no-op without storage', () => {
    expect(readDoneChapters('Test Book', null)).toEqual(new Set());
    expect(() => writeDoneChapters('Test Book', new Set(['a']), null)).not.toThrow();
  });

  it('is a no-op without a book title', () => {
    const storage = fakeStorage();
    writeDoneChapters('', new Set(['a']), storage);
    expect(storage.data.size).toBe(0);
    expect(readDoneChapters('', storage)).toEqual(new Set());
  });

  it('swallows storage write failures', () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => writeDoneChapters('Test Book', new Set(['a']), failing)).not.toThrow();
  });
});
