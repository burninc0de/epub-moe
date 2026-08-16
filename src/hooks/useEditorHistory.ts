import { useCallback, useRef, useState } from 'react';
import { EPUBData, OPFPackage } from '../types/epub';
import {
  createHistoryState,
  pushHistory,
  undoHistory,
  redoHistory,
  goToHistory,
  HistoryEntry,
  HistoryActionResult,
} from '../utils/history';

export const MAX_HISTORY = 100;

export interface HistoryContext {
  chapterId: string | null;
  fragmentId: string | null;
}

export const cloneEPUBData = (data: EPUBData): EPUBData => ({
  title: data.title,
  chapters: data.chapters.map((chapter) => ({ ...chapter })),
  smilFiles: new Map(
    Array.from(data.smilFiles.entries()).map(([id, fragments]) => [
      id,
      fragments.map((fragment) => ({ ...fragment })),
    ])
  ),
  audioFiles: new Map(
    Array.from(data.audioFiles.entries()).map(([id, file]) => [
      id,
      { ...file },
    ])
  ),
  manifest: JSON.parse(JSON.stringify(data.manifest)) as OPFPackage,
});

export const useEditorHistory = () => {
  const stateRef = useRef(createHistoryState<EPUBData, HistoryContext>());
  const [history, setHistory] = useState<HistoryEntry<EPUBData, HistoryContext>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const sync = useCallback(() => {
    setHistory(stateRef.current.entries);
    setHistoryIndex(stateRef.current.index);
  }, []);

  const record = useCallback(
    (data: EPUBData, beforeContext: HistoryContext, afterContext: HistoryContext, label: string) => {
      stateRef.current = pushHistory(
        stateRef.current,
        cloneEPUBData(data),
        beforeContext,
        afterContext,
        label,
        MAX_HISTORY
      );
      sync();
    },
    [sync]
  );

  const clear = useCallback(() => {
    stateRef.current = createHistoryState<EPUBData, HistoryContext>();
    sync();
  }, [sync]);

  const undo = useCallback((): HistoryActionResult<EPUBData, HistoryContext> | null => {
    const result = undoHistory(stateRef.current);
    if (!result) return null;
    stateRef.current = result.state;
    sync();
    return result;
  }, [sync]);

  const redo = useCallback((): HistoryActionResult<EPUBData, HistoryContext> | null => {
    const result = redoHistory(stateRef.current);
    if (!result) return null;
    stateRef.current = result.state;
    sync();
    return result;
  }, [sync]);

  const goTo = useCallback((index: number): HistoryActionResult<EPUBData, HistoryContext> | null => {
    const result = goToHistory(stateRef.current, index);
    if (!result) return null;
    stateRef.current = result.state;
    sync();
    return result;
  }, [sync]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return {
    history,
    historyIndex,
    canUndo,
    canRedo,
    record,
    undo,
    redo,
    goTo,
    clear,
  };
};
