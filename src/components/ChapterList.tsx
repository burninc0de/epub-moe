import React from 'react';
import { Volume2 } from 'lucide-react';
import { EPUBChapter } from '../types/epub';

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
    <div className="bg-white border-r border-gray-200 flex flex-col h-full dark:bg-gray-800 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 truncate dark:text-white" title={title}>
          {title}
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {visibleChapters.map((chapter) => (
          <button
            key={chapter.id}
            onClick={() => onChapterSelect(chapter.id)}
            className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150 dark:border-gray-700 dark:hover:bg-gray-700 ${
              selectedChapter === chapter.id ? 'bg-blue-50 border-l-4 border-l-blue-600 dark:bg-blue-900 dark:border-l-blue-400' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 truncate dark:text-white">{chapter.href}</h3>
              </div>
              {chapter.mediaOverlay && (
                <Volume2 className="w-4 h-4 text-green-600 ml-2 flex-shrink-0 dark:text-green-400" />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
