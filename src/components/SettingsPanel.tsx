import React from 'react';
import { Github } from 'lucide-react';
import { version } from '../../package.json';
import { FragmentSpacing, FRAGMENT_SPACING_OPTIONS } from '../types/epub';

interface SettingsPanelProps {
  autoFollow: boolean;
  onAutoFollowChange: (value: boolean) => void;
  fragmentSpacing: FragmentSpacing;
  onFragmentSpacingChange: (value: FragmentSpacing) => void;
  onlyAudioChapters: boolean;
  onOnlyAudioChaptersChange: (value: boolean) => void;
}

const Switch: React.FC<{ checked: boolean; onChange: () => void; title: string }> = ({ checked, onChange, title }) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors flex-shrink-0 ${
      checked ? 'bg-blue-600' : 'bg-gray-700'
    }`}
    title={title}
  >
    <span
      className={`inline-block w-4 h-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  autoFollow,
  onAutoFollowChange,
  fragmentSpacing,
  onFragmentSpacingChange,
  onlyAudioChapters,
  onOnlyAudioChaptersChange,
}) => {
  return (
    <div>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-100">Auto-follow fragments</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Scroll the text viewer to center the fragment when selecting audio.
            </p>
          </div>
          <Switch checked={autoFollow} onChange={() => onAutoFollowChange(!autoFollow)} title="Toggle auto-follow" />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-100">Show only audio chapters</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Only list chapters that have a media overlay (audio) in the sidebar.
            </p>
          </div>
          <Switch checked={onlyAudioChapters} onChange={() => onOnlyAudioChaptersChange(!onlyAudioChapters)} title="Toggle audio-only chapters" />
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-100">Fragment spacing</h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-2">
            Vertical spacing between fragments in the text viewer.
          </p>
          <div className="inline-flex rounded-md overflow-hidden border border-gray-700">
            {FRAGMENT_SPACING_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                onClick={() => onFragmentSpacingChange(option.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  index > 0 ? 'border-l border-gray-700' : ''
                } ${
                  fragmentSpacing === option.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-base text-gray-300 hover:bg-raised'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mt-6 pt-4 border-t border-line">
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
      </div>
    </div>
  );
};
