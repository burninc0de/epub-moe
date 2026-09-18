import React, { useEffect, useRef, useState } from 'react';
import { Volume2, CheckCircle2 } from 'lucide-react';
import { EPUBChapter, ChapterLabelMode } from '../types/epub';
import { readDoneChapters, toggleDoneChapter } from '../utils/chapterProgress';
import { PanelHeader } from './ui';

interface ChapterListProps {
  title: string;
  chapters: EPUBChapter[];
  selectedChapter: string | null;
  onChapterSelect: (chapterId: string) => void;
  onlyAudioChapters?: boolean;
  labelMode?: ChapterLabelMode;
}

interface MenuState {
  x: number;
  y: number;
  href: string;
}

const MENU_WIDTH = 168;
const MENU_HEIGHT = 40;

export const ChapterList: React.FC<ChapterListProps> = ({
  title,
  chapters,
  selectedChapter,
  onChapterSelect,
  onlyAudioChapters = false,
  labelMode = 'title',
}) => {
  const visibleChapters = onlyAudioChapters ? chapters.filter(c => c.mediaOverlay) : chapters;

  // Show the other label as a tooltip, so neither is ever hidden.
  const labelFor = (chapter: EPUBChapter) => {
    if (labelMode === 'filename') return chapter.href;
    return chapter.title || chapter.href;
  };
  const tooltipFor = (chapter: EPUBChapter) =>
    labelMode === 'filename' ? chapter.title || chapter.href : chapter.href;

  // Finished chapters, per book. Reloaded whenever the book changes.
  const [done, setDone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setDone(readDoneChapters(title));
  }, [title]);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss on anything that would leave the menu stranded.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);
    // Capture phase: the sidebar scrolls, and scroll events do not bubble.
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const openMenu = (event: React.MouseEvent, href: string) => {
    event.preventDefault();
    // Keep it on screen when right-clicking near an edge.
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8),
      y: Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 8),
      href,
    });
  };

  const menuChapter = menu ? visibleChapters.find(c => c.href === menu.href) : undefined;
  const menuIsDone = menu ? done.has(menu.href) : false;

  return (
    <div className="bg-panel border-r border-line flex flex-col h-full">
      <PanelHeader title={title} />

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visibleChapters.map((chapter) => {
          const isSelected = selectedChapter === chapter.id;
          const isDone = done.has(chapter.href);
          return (
            <button
              key={chapter.id}
              onClick={() => onChapterSelect(chapter.id)}
              onContextMenu={(event) => (chapter.mediaOverlay ? openMenu(event, chapter.href) : undefined)}
              title={chapter.mediaOverlay ? `${tooltipFor(chapter)} — right-click to mark finished` : tooltipFor(chapter)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors ${
                isSelected
                  ? 'bg-blue-500/10 text-blue-300'
                  : 'text-gray-300 hover:bg-raised hover:text-gray-100'
              }`}
            >
              <span className="flex-1 min-w-0 truncate text-left">{labelFor(chapter)}</span>
              {chapter.mediaOverlay && (
                isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                ) : (
                  <Volume2 className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-500'}`} />
                )
              )}
            </button>
          );
        })}
      </div>

      {menu && menuChapter && (
        <div
          ref={menuRef}
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: menu.x, top: menu.y, width: MENU_WIDTH }}
          className="fixed z-50 rounded-md border border-line bg-panel py-1 shadow-2xl"
        >
          <button
            role="menuitem"
            onClick={() => {
              setDone(toggleDoneChapter(title, done, menu.href));
              setMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-gray-300 hover:bg-raised hover:text-gray-100"
          >
            {menuIsDone ? <Volume2 className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {menuIsDone ? 'Mark as not finished' : 'Mark as finished'}
          </button>
        </div>
      )}
    </div>
  );
};
