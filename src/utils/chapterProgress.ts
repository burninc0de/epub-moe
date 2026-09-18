/**
 * Per-book "chapter finished" markers, kept in localStorage.
 *
 * Keyed by the book title, with the chapter's file path (`href`) as the value:
 * both come from the EPUB itself, so a re-import of the same book keeps its
 * progress. Chapter `id` would work too, but `href` is the more meaningful thing
 * to see when inspecting storage by hand.
 *
 * Storage is injected so this stays testable: the unit tests run in a plain Node
 * environment with no localStorage.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY_PREFIX = 'chapterProgress:';

export const storageKeyFor = (bookTitle: string): string => `${KEY_PREFIX}${bookTitle}`;

/** localStorage when it exists and is usable, otherwise null (private mode, Node). */
export const defaultStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Chapter hrefs marked done for a book. Never throws; bad data reads as empty. */
export const readDoneChapters = (bookTitle: string, storage: StorageLike | null = defaultStorage()): Set<string> => {
  if (!storage || !bookTitle) return new Set();
  try {
    const raw = storage.getItem(storageKeyFor(bookTitle));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string' && value.length > 0));
  } catch {
    return new Set();
  }
};

export const writeDoneChapters = (
  bookTitle: string,
  done: ReadonlySet<string>,
  storage: StorageLike | null = defaultStorage()
): void => {
  if (!storage || !bookTitle) return;
  try {
    storage.setItem(storageKeyFor(bookTitle), JSON.stringify([...done]));
  } catch {
    // Quota or a disabled store. Progress is a convenience, not data worth
    // interrupting the user for.
  }
};

/** Toggle one chapter, returning the new set. */
export const toggleDoneChapter = (
  bookTitle: string,
  done: ReadonlySet<string>,
  href: string,
  storage: StorageLike | null = defaultStorage()
): Set<string> => {
  const next = new Set(done);
  if (next.has(href)) next.delete(href);
  else next.add(href);
  writeDoneChapters(bookTitle, next, storage);
  return next;
};
