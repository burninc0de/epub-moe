import { describe, it, expect } from 'vitest';
import {
  createHistoryState,
  pushHistory,
  canUndoHistory,
  canRedoHistory,
  undoHistory,
  redoHistory,
  goToHistory,
} from './history';

interface Context {
  chapterId: string | null;
  fragmentId: string | null;
}

const ctx = (chapterId: string | null = 'c1', fragmentId: string | null = null): Context => ({
  chapterId,
  fragmentId,
});

describe('history', () => {
  it('starts empty', () => {
    const state = createHistoryState<string, Context>();
    expect(state.entries).toHaveLength(0);
    expect(state.index).toBe(-1);
    expect(canUndoHistory(state)).toBe(false);
    expect(canRedoHistory(state)).toBe(false);
  });

  it('records snapshots and can undo/redo', () => {
    let state = createHistoryState<string, Context>();
    state = pushHistory(state, 'a', ctx(null, null), ctx('c1', null), 'load', 100);
    state = pushHistory(state, 'b', ctx('c1', null), ctx('c1', 'f1'), 'edit', 100);
    state = pushHistory(state, 'c', ctx('c1', 'f1'), ctx('c1', 'f1'), 'edit', 100);

    expect(state.index).toBe(2);
    expect(canUndoHistory(state)).toBe(true);
    expect(canRedoHistory(state)).toBe(false);

    const undoResult = undoHistory(state);
    expect(undoResult).not.toBeNull();
    expect(undoResult!.state.index).toBe(1);
    expect(undoResult!.entry.snapshot).toBe('b');
    expect(undoResult!.selectionContext).toEqual(ctx('c1', 'f1'));
    expect(canRedoHistory(undoResult!.state)).toBe(true);

    const redoResult = redoHistory(undoResult!.state);
    expect(redoResult).not.toBeNull();
    expect(redoResult!.state.index).toBe(2);
    expect(redoResult!.entry.snapshot).toBe('c');
  });

  it('truncates future entries when recording after an undo', () => {
    let state = createHistoryState<string, Context>();
    state = pushHistory(state, 'a', ctx(), ctx(), 'a', 100);
    state = pushHistory(state, 'b', ctx(), ctx(), 'b', 100);
    state = pushHistory(state, 'c', ctx(), ctx(), 'c', 100);

    const undone = undoHistory(state)!;
    const undoneAgain = undoHistory(undone.state)!;
    expect(undoneAgain.state.index).toBe(0);

    const next = pushHistory(undoneAgain.state, 'x', ctx(), ctx(), 'x', 100);
    expect(next.entries).toHaveLength(2);
    expect(next.entries.map((e) => e.snapshot)).toEqual(['a', 'x']);
    expect(next.index).toBe(1);
    expect(canRedoHistory(next)).toBe(false);
  });

  it('caps the stack at maxSteps and drops oldest entries', () => {
    let state = createHistoryState<number, Context>();
    for (let i = 0; i < 105; i++) {
      state = pushHistory(state, i, ctx(), ctx(), String(i), 100);
    }

    expect(state.entries).toHaveLength(100);
    expect(state.entries[0].snapshot).toBe(5);
    expect(state.entries[99].snapshot).toBe(104);
    expect(state.index).toBe(99);
  });

  it('keeps context and label on entries', () => {
    const before: Context = { chapterId: 'ch1', fragmentId: 'f1' };
    const after: Context = { chapterId: 'ch1', fragmentId: null };
    let state = createHistoryState<string, Context>();
    state = pushHistory(state, 'a', before, after, 'Delete fragment', 100);

    expect(state.entries[0].beforeContext).toEqual(before);
    expect(state.entries[0].context).toEqual(after);
    expect(state.entries[0].label).toBe('Delete fragment');
    expect(state.entries[0].timestamp).toBeGreaterThan(0);
  });

  it('can jump to any index', () => {
    let state = createHistoryState<string, Context>();
    state = pushHistory(state, 'a', ctx(), ctx(), 'a', 100);
    state = pushHistory(state, 'b', ctx(), ctx(), 'b', 100);
    state = pushHistory(state, 'c', ctx(), ctx(), 'c', 100);

    const jumped = goToHistory(state, 0);
    expect(jumped).not.toBeNull();
    expect(jumped!.state.index).toBe(0);
    expect(jumped!.entry.snapshot).toBe('a');
    expect(canRedoHistory(jumped!.state)).toBe(true);

    expect(goToHistory(state, -1)).toBeNull();
    expect(goToHistory(state, 99)).toBeNull();
  });

  it('returns null for undo at the start and redo at the end', () => {
    let state = createHistoryState<string, Context>();
    state = pushHistory(state, 'a', ctx(), ctx(), 'a', 100);

    expect(undoHistory(state)).toBeNull();
    expect(redoHistory(state)).toBeNull();
  });
});
