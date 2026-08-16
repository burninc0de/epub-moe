import React, { useEffect, useState } from 'react';
import { Clock, Minus, Plus, Trash2, Undo2, Redo2 } from 'lucide-react';
import { EPUBData } from '../types/epub';
import { HistoryEntry } from '../utils/history';
import { HistoryContext } from '../hooks/useEditorHistory';
import { SMILFragment } from '../types/epub';
import { formatTimeWithMs, parseTimeInput } from '../utils/time';
import { Button, IconButton, PanelHeader, SectionLabel, FieldLabel, TextInput } from './ui';

interface FragmentEditorProps {
  selectedFragment: SMILFragment | null;
  nudgeStep: number;
  onFragmentUpdate: (fragmentId: string, updates: Partial<SMILFragment>) => void;
  onFragmentDelete: (fragmentId: string) => void;
  onNudgeFragmentStart: (fragmentId: string, deltaSeconds: number) => void;
  onNudgeFragmentEnd: (fragmentId: string, deltaSeconds: number) => void;
  history: HistoryEntry<EPUBData, HistoryContext>[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHistoryGoTo: (index: number) => void;
}

export const FragmentEditor: React.FC<FragmentEditorProps> = ({
  selectedFragment,
  nudgeStep,
  onFragmentUpdate,
  onFragmentDelete,
  onNudgeFragmentStart,
  onNudgeFragmentEnd,
  history,
  historyIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onHistoryGoTo,
}) => {
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
      clipEnd: newEnd,
    });
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
              <SectionLabel className="mb-3">Nudge</SectionLabel>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FieldLabel>Start</FieldLabel>
                  <div className="flex gap-2">
                    <IconButton
                      onClick={() => onNudgeFragmentStart(selectedFragment.id, -nudgeStep)}
                      title={`Nudge start earlier by ${nudgeStep}s`}
                      className="p-2"
                    >
                      <Minus className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      onClick={() => onNudgeFragmentStart(selectedFragment.id, nudgeStep)}
                      title={`Nudge start later by ${nudgeStep}s`}
                      className="p-2"
                    >
                      <Plus className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <FieldLabel>End</FieldLabel>
                  <div className="flex gap-2">
                    <IconButton
                      onClick={() => onNudgeFragmentEnd(selectedFragment.id, -nudgeStep)}
                      title={`Nudge end earlier by ${nudgeStep}s`}
                      className="p-2"
                    >
                      <Minus className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      onClick={() => onNudgeFragmentEnd(selectedFragment.id, nudgeStep)}
                      title={`Nudge end later by ${nudgeStep}s`}
                      className="p-2"
                    >
                      <Plus className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>
              </div>
            </section>

            <section className="pt-5 border-t border-line">
              <SectionLabel className="mb-3">Actions</SectionLabel>
              <IconButton
                variant="danger"
                onClick={() => onFragmentDelete(selectedFragment.id)}
                title="Delete fragment"
                className="p-2"
              >
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </section>
          </div>
        ) : (
          <div className="text-center py-12 px-4">
            <div className="w-12 h-12 bg-raised rounded-full flex items-center justify-center mx-auto mb-3">
              <Clock className="w-5 h-5 text-gray-500" />
            </div>
            <p className="text-sm text-gray-500">Select a fragment from the waveform or text to edit its timing</p>
          </div>
        )}

        <section className="pt-5 border-t border-line mt-6">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>History</SectionLabel>
            <div className="flex gap-1">
              <IconButton
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                className="p-1.5"
              >
                <Undo2 className="w-4 h-4" />
              </IconButton>
              <IconButton
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                className="p-1.5"
              >
                <Redo2 className="w-4 h-4" />
              </IconButton>
            </div>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-gray-500">No history yet</p>
          ) : (
            <ol className="max-h-48 overflow-y-auto space-y-1 -mx-2 px-2">
              {[...history].map((entry, reverseIndex) => {
                const index = history.length - 1 - reverseIndex;
                const isCurrent = index === historyIndex;

                return (
                  <li key={`${entry.label}-${entry.timestamp}-${index}`}>
                    <button
                      onClick={() => onHistoryGoTo(index)}
                      disabled={isCurrent}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs truncate transition-colors ${
                        isCurrent
                          ? 'bg-blue-500/15 text-blue-400'
                        : 'text-gray-400 hover:bg-raised hover:text-gray-200'
                      }`}
                      title={entry.label}
                    >
                      {entry.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};
