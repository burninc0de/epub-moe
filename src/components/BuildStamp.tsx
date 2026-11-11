import React from 'react';
import { Github } from 'lucide-react';
import { version } from '../../package.json';

export const BuildStamp: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center justify-center gap-2 text-xs text-gray-500 ${className}`}>
    <a
      href="https://github.com/burninc0de/epub-moe"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 hover:text-gray-300 transition-colors"
    >
      <Github className="w-3.5 h-3.5" />
      <span>GitHub</span>
    </a>
    <span className="text-gray-700">|</span>
    <span>v{version}</span>
    {__BUILD_COMMIT__ && (
      <>
        <span className="text-gray-700">|</span>
        <a
          href={`https://github.com/burninc0de/epub-moe/commit/${__BUILD_COMMIT__}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Commit this build was made from"
          className="tabular-nums hover:text-gray-300 transition-colors"
        >
          {__BUILD_COMMIT__}
        </a>
      </>
    )}
  </div>
);
