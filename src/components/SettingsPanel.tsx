import React from 'react';
import { Settings, Github, X } from 'lucide-react';
import { version } from '../../package.json';
import { FragmentSpacing, FRAGMENT_SPACING_OPTIONS } from '../types/epub';

interface SettingsPanelProps {
  onClose: () => void;
  autoFollow: boolean;
  onAutoFollowChange: (value: boolean) => void;
  fragmentSpacing: FragmentSpacing;
  onFragmentSpacingChange: (value: FragmentSpacing) => void;
  onlyAudioChapters: boolean;
  onOnlyAudioChaptersChange: (value: boolean) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  autoFollow,
  onAutoFollowChange,
  fragmentSpacing,
  onFragmentSpacingChange,
  onlyAudioChapters,
  onOnlyAudioChaptersChange,
}) => {
  return (
    <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white rounded-lg shadow-xl dark:bg-gray-800">
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Close settings"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Auto-follow fragments</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Scroll the text viewer to center the fragment when selecting audio.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={autoFollow}
              onClick={() => onAutoFollowChange(!autoFollow)}
              className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors flex-shrink-0 ${
                autoFollow ? 'bg-blue-600 dark:bg-blue-800' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              title="Toggle auto-follow"
            >
              <span
                className={`inline-block w-4 h-4 transform rounded-full bg-white transition-transform ${
                  autoFollow ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Show only audio chapters</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Only list chapters that have a media overlay (audio) in the sidebar.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={onlyAudioChapters}
              onClick={() => onOnlyAudioChaptersChange(!onlyAudioChapters)}
              className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors flex-shrink-0 ${
                onlyAudioChapters ? 'bg-blue-600 dark:bg-blue-800' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              title="Toggle audio-only chapters"
            >
              <span
                className={`inline-block w-4 h-4 transform rounded-full bg-white transition-transform ${
                  onlyAudioChapters ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">Fragment spacing</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Vertical spacing between fragments in the text viewer.
            </p>
            <div className="inline-flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
              {FRAGMENT_SPACING_OPTIONS.map((option, index) => (
                <button
                  key={option.value}
                  onClick={() => onFragmentSpacingChange(option.value)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    index > 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
                  } ${
                    fragmentSpacing === option.value
                      ? 'bg-blue-600 text-white dark:bg-blue-800'
                      : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pt-2 pb-6">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <a
            href="https://github.com/burninc0de/epub-moe"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <Github className="w-4 h-4" />
            <span>GitHub</span>
          </a>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span>v{version}</span>
        </div>
      </div>
    </div>
  );
};
