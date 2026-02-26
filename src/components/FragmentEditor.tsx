import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Split } from 'lucide-react';
import { SMILFragment } from '../types/epub';

interface FragmentEditorProps {
  fragments: SMILFragment[];
  selectedFragment: SMILFragment | null;
  onFragmentUpdate: (fragmentId: string, updates: Partial<SMILFragment>) => void;
  onFragmentDelete: (fragmentId: string) => void;
  onFragmentSplit: (fragmentId: string, splitTime: number) => void;
  onFragmentAdd: (afterId: string, newFragment: Partial<SMILFragment>) => void;
}

export const FragmentEditor: React.FC<FragmentEditorProps> = ({
  //fragments,
  selectedFragment,
  onFragmentUpdate,
  onFragmentDelete,
  onFragmentSplit,
  onFragmentAdd
}) => {
  const [splitTime, setSplitTime] = useState('');
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const parseTimeInput = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const [mins, secsMs] = parts;
      const [secs, ms = '0'] = secsMs.split('.');
      return parseInt(mins) * 60 + parseInt(secs) + parseInt(ms.padEnd(3, '0')) / 1000;
    }
    return parseFloat(timeStr) || 0;
  };

  useEffect(() => {
    if (!selectedFragment) {
      setStartTimeInput('');
      setEndTimeInput('');
      return;
    }

    setStartTimeInput(formatTime(selectedFragment.clipBegin));
    setEndTimeInput(formatTime(selectedFragment.clipEnd));
  }, [selectedFragment]);

  const hasTimingChanges = selectedFragment
    ? startTimeInput !== formatTime(selectedFragment.clipBegin) ||
      endTimeInput !== formatTime(selectedFragment.clipEnd)
    : false;

  const handleApplyTiming = () => {
    if (!selectedFragment) return;

    const newStart = parseTimeInput(startTimeInput);
    const newEnd = parseTimeInput(endTimeInput);
    if (newStart >= newEnd) return;

    onFragmentUpdate(selectedFragment.id, {
      clipBegin: newStart,
      clipEnd: newEnd
    });
  };

  const handleSplit = () => {
    if (selectedFragment && splitTime) {
      const time = parseTimeInput(splitTime);
      if (time > selectedFragment.clipBegin && time < selectedFragment.clipEnd) {
        onFragmentSplit(selectedFragment.id, time);
        setSplitTime('');
      }
    }
  };

  return (
    <div className="bg-white border-l border-gray-200 flex flex-col dark:bg-gray-800 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Fragment Editor</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {selectedFragment ? (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-900 dark:border-blue-700">
              <h3 className="font-medium text-blue-900 mb-3 dark:text-blue-200">Fragment Details</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-blue-700 mb-1 dark:text-blue-300">
                    Start Time
                  </label>
                  <input
                    type="text"
                    value={startTimeInput}
                    onChange={(e) => setStartTimeInput(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-700 mb-1 dark:text-blue-300">
                    End Time
                  </label>
                  <input
                    type="text"
                    value={endTimeInput}
                    onChange={(e) => setEndTimeInput(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  />
                </div>

                <button
                  onClick={handleApplyTiming}
                  disabled={!hasTimingChanges}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors dark:bg-blue-800 dark:hover:bg-blue-700 dark:disabled:bg-gray-600 dark:disabled:text-gray-300"
                >
                  Apply
                </button>


              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 dark:bg-gray-700 dark:border-gray-600">
              <h4 className="font-medium text-gray-900 mb-3 dark:text-white">Fragment Actions</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                    Split at Time
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={splitTime}
                      onChange={(e) => setSplitTime(e.target.value)}
                      placeholder="1:23.456"
                      className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-blue-400 dark:focus:border-blue-400"
                    />
                    <button
                      onClick={handleSplit}
                      disabled={!splitTime}
                      className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors dark:bg-green-800 dark:hover:bg-green-700 dark:disabled:bg-gray-500"
                    >
                      <Split className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onFragmentAdd(selectedFragment.id, {
                      clipBegin: selectedFragment.clipEnd,
                      clipEnd: selectedFragment.clipEnd + 1,
                      text: '',
                      textSrc: selectedFragment.textSrc,
                      audioSrc: selectedFragment.audioSrc
                    })}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors dark:bg-blue-800 dark:hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4" />
                    Add After
                  </button>
                  
                  <button
                    onClick={() => onFragmentDelete(selectedFragment.id)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors dark:bg-red-800 dark:hover:bg-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-gray-700">
              <Split className="w-8 h-8 text-gray-400 dark:text-gray-300" />
            </div>
            <p className="text-gray-600 dark:text-gray-300">Select a fragment from the waveform or text to edit its timing</p>
          </div>
        )}
      </div>


    </div>
  );
};