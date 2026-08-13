import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Split } from 'lucide-react';
import { SMILFragment } from '../types/epub';
import { formatTimeWithMs, parseTimeInput } from '../utils/time';
import { Button, IconButton, PanelHeader, SectionLabel, FieldLabel, TextInput } from './ui';

interface FragmentEditorProps {
  selectedFragment: SMILFragment | null;
  onFragmentUpdate: (fragmentId: string, updates: Partial<SMILFragment>) => void;
  onFragmentDelete: (fragmentId: string) => void;
  onFragmentSplit: (fragmentId: string, splitTime: number) => void;
  onFragmentAdd: (afterId: string, newFragment: Partial<SMILFragment>) => void;
}

export const FragmentEditor: React.FC<FragmentEditorProps> = ({
  selectedFragment,
  onFragmentUpdate,
  onFragmentDelete,
  onFragmentSplit,
  onFragmentAdd
}) => {
  const [splitTime, setSplitTime] = useState('');
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');

  useEffect(() => {
    if (!selectedFragment) {
      setStartTimeInput('');
      setEndTimeInput('');
      return;
    }

    setStartTimeInput(formatTimeWithMs(selectedFragment.clipBegin));
    setEndTimeInput(formatTimeWithMs(selectedFragment.clipEnd));
  }, [selectedFragment]);

  const hasTimingChanges = selectedFragment
    ? startTimeInput !== formatTimeWithMs(selectedFragment.clipBegin) ||
      endTimeInput !== formatTimeWithMs(selectedFragment.clipEnd)
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
    <div className="bg-panel border-l border-line flex flex-col">
      <PanelHeader title="Fragment Editor" />

      <div className="flex-1 overflow-y-auto p-4">
        {selectedFragment ? (
          <div className="space-y-6">
            <section>
              <SectionLabel className="mb-3">Timing</SectionLabel>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Start Time</FieldLabel>
                  <TextInput
                    type="text"
                    value={startTimeInput}
                    onChange={(e) => setStartTimeInput(e.target.value)}
                  />
                </div>

                <div>
                  <FieldLabel>End Time</FieldLabel>
                  <TextInput
                    type="text"
                    value={endTimeInput}
                    onChange={(e) => setEndTimeInput(e.target.value)}
                  />
                </div>

                <Button
                  variant="primary"
                  onClick={handleApplyTiming}
                  disabled={!hasTimingChanges}
                  className="w-full"
                >
                  Apply
                </Button>
              </div>
            </section>

            <section className="pt-5 border-t border-line">
              <SectionLabel className="mb-3">Split</SectionLabel>
              <div className="flex gap-2">
                <TextInput
                  type="text"
                  value={splitTime}
                  onChange={(e) => setSplitTime(e.target.value)}
                  placeholder="1:23.456"
                  className="flex-1 min-w-0"
                />
                <Button
                  variant="secondary"
                  onClick={handleSplit}
                  disabled={!splitTime}
                  title="Split at time"
                  className="px-2.5"
                >
                  <Split className="w-4 h-4" />
                </Button>
              </div>
            </section>

            <section className="pt-5 border-t border-line">
              <SectionLabel className="mb-3">Actions</SectionLabel>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => onFragmentAdd(selectedFragment.id, {
                    clipBegin: selectedFragment.clipEnd,
                    clipEnd: selectedFragment.clipEnd + 1,
                    text: '',
                    textSrc: selectedFragment.textSrc,
                    audioSrc: selectedFragment.audioSrc
                  })}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4" />
                  Add After
                </Button>

                <IconButton
                  variant="danger"
                  onClick={() => onFragmentDelete(selectedFragment.id)}
                  title="Delete fragment"
                  className="p-2"
                >
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            </section>
          </div>
        ) : (
          <div className="text-center py-12 px-4">
            <div className="w-12 h-12 bg-raised rounded-full flex items-center justify-center mx-auto mb-3">
              <Split className="w-5 h-5 text-gray-500" />
            </div>
            <p className="text-sm text-gray-500">Select a fragment from the waveform or text to edit its timing</p>
          </div>
        )}
      </div>
    </div>
  );
};