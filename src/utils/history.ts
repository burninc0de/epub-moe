export interface HistoryEntry<T, C> {
  snapshot: T;
  beforeContext: C;
  context: C;
  label: string;
  timestamp: number;
}

export interface HistoryState<T, C> {
  entries: HistoryEntry<T, C>[];
  index: number;
}

export const createHistoryState = <T, C>(): HistoryState<T, C> => ({
  entries: [],
  index: -1,
});

export const canUndoHistory = <T, C>(state: HistoryState<T, C>): boolean =>
  state.index > 0;

export const canRedoHistory = <T, C>(state: HistoryState<T, C>): boolean =>
  state.index < state.entries.length - 1;

export const pushHistory = <T, C>(
  state: HistoryState<T, C>,
  snapshot: T,
  beforeContext: C,
  afterContext: C,
  label: string,
  maxSteps: number
): HistoryState<T, C> => {
  const entries = state.entries.slice(0, state.index + 1);
  entries.push({
    snapshot,
    beforeContext,
    context: afterContext,
    label,
    timestamp: Date.now(),
  });

  if (entries.length > maxSteps) {
    entries.shift();
  }

  return {
    entries,
    index: entries.length - 1,
  };
};

export interface HistoryActionResult<T, C> {
  state: HistoryState<T, C>;
  entry: HistoryEntry<T, C>;
  selectionContext: C;
}

export const undoHistory = <T, C>(
  state: HistoryState<T, C>
): HistoryActionResult<T, C> | null => {
  if (!canUndoHistory(state)) return null;

  const index = state.index - 1;
  return {
    state: { ...state, index },
    entry: state.entries[index],
    selectionContext: state.entries[index + 1].beforeContext,
  };
};

export const redoHistory = <T, C>(
  state: HistoryState<T, C>
): HistoryActionResult<T, C> | null => {
  if (!canRedoHistory(state)) return null;

  const index = state.index + 1;
  return {
    state: { ...state, index },
    entry: state.entries[index],
    selectionContext: state.entries[index].context,
  };
};

export const goToHistory = <T, C>(
  state: HistoryState<T, C>,
  index: number
): HistoryActionResult<T, C> | null => {
  if (index < 0 || index >= state.entries.length) return null;

  return {
    state: { ...state, index },
    entry: state.entries[index],
    selectionContext: state.entries[index].context,
  };
};
