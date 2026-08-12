import React from 'react';
import { Volume2 } from 'lucide-react';
import { EPUBChapter } from '../types/epub';
import { PanelHeader } from './ui';

interface ChapterListProps {
  title: string;
  chapters: EPUBChapter[];
  selectedChapter: string | null;
  onChapterSelect: (chapterId: string) => void;
  onlyAudioChapters?: boolean;
}

export const ChapterList: React.FC<ChapterListProps> = ({
  title,
  chapters,
  selectedChapter,
  onChapterSelect,
  onlyAudioChapters = false,
}) => {
  const visibleChapters = onlyAudioChapters ? chapters.filter(c => c.mediaOverlay) : chapters;
  return (
    <div className="bg-panel border-r border-line flex flex-col h-full">
      <PanelHeader title={title} />

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visibleChapters.map((chapter) => {
          const isSelected = selectedChapter === chapter.id;
          return (
            <button
              key={chapter.id}
              onClick={() => onChapterSelect(chapter.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors ${
                isSelected
                  ? 'bg-blue-500/10 text-blue-300'
                  : 'text-gray-300 hover:bg-raised hover:text-gray-100'
              }`}
            >
              <span className="flex-1 min-w-0 truncate text-left">{chapter.href}</span>
              {chapter.mediaOverlay && (
                <Volume2 className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-500'}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
