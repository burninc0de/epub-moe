/**
 * What the chapter context menu offers.
 *
 * Kept separate from the component so the conditions — which chapter gets which
 * action — are testable without a browser.
 */

export type ChapterMenuActionId = 'toggle-done' | 'copy-title' | 'copy-filename';

export interface ChapterMenuAction {
  id: ChapterMenuActionId;
  label: string;
  /** Text this action puts on the clipboard, for the copy actions. */
  copyText?: string;
}

export interface MenuChapter {
  /** Derived chapter name, or the file path when no heading was found. */
  title: string;
  /** Path inside the EPUB. */
  href: string;
  hasAudio: boolean;
}

/**
 * The chapter's own heading, or null when the label fell back to the file path.
 * The parser stores the path in `title` when it finds no heading, so equality
 * with `href` is how "no real title" is detected.
 */
export const derivedTitle = (chapter: MenuChapter): string | null =>
  chapter.title && chapter.title !== chapter.href ? chapter.title : null;

export const chapterMenuActions = (chapter: MenuChapter, isDone: boolean): ChapterMenuAction[] => {
  const actions: ChapterMenuAction[] = [];
  const title = derivedTitle(chapter);

  if (chapter.hasAudio) {
    actions.push({ id: 'toggle-done', label: isDone ? 'Mark as not finished' : 'Mark as finished' });
  }
  if (title) {
    actions.push({ id: 'copy-title', label: 'Copy title', copyText: title });
  }
  actions.push({ id: 'copy-filename', label: 'Copy file name', copyText: chapter.href });

  return actions;
};
