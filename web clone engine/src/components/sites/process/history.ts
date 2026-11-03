/**
 * Undo and redo for the Process page. Typing in a field is one edit per keystroke, so edits that carry the same `key`
 * within `COALESCE_MS` of each other become one step. Pure: the caller supplies the time.
 */
export interface History<T> { present: T; past: T[]; future: T[]; key?: string; at: number }
export type HistoryAction<T> =
  | { type: "edit"; next: (current: T) => T; key?: string; at: number }
  | { type: "replace"; value: T }
  | { type: "undo" | "redo" };

export const COALESCE_MS = 1000;
export const MAX_STEPS = 100;

export const createHistory = <T,>(present: T): History<T> => ({ present, past: [], future: [], at: 0 });

export function historyReducer<T>(state: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case "replace": return { present: action.value, past: [], future: [], at: 0 };
    case "undo": {
      if (!state.past.length) return state;
      return { present: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.present, ...state.future], at: 0 };
    }
    case "redo": {
      if (!state.future.length) return state;
      return { present: state.future[0], past: [...state.past, state.present], future: state.future.slice(1), at: 0 };
    }
    case "edit": {
      const next = action.next(state.present);
      if (next === state.present) return state;
      const same = !!action.key && action.key === state.key && action.at - state.at < COALESCE_MS && state.past.length > 0;
      return { present: next, past: same ? state.past : [...state.past, state.present].slice(-MAX_STEPS), future: [], key: action.key, at: action.at };
    }
  }
}
