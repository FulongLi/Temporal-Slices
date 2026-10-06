/**
 * The interaction state machine.
 *
 *   OBSERVE ──select──▶ FOCUS ──enter──▶ ENTERING ──entered──▶ INSIDE
 *      ▲                 │  ▲               │  ▲                  │
 *      └─────escape──────┘  └───exited── EXITING ◀────escape──────┘
 *
 * Escape during ENTERING reverses into EXITING from wherever it is, and
 * Enter during EXITING turns back again: the transition is a single
 * reversible timeline, not two one-shot animations.
 */

export type TemporalMode = "observe" | "focus" | "entering" | "inside" | "exiting";

export interface TemporalState {
  mode: TemporalMode;
  /** Slice under examination (focus, entering, inside, exiting). */
  focus: number | null;
  /** Slice under the pointer. */
  hover: number | null;
  /** Slice nearest the observer. */
  present: number;
  /** Has the user moved yet? Drives the first-run hint. */
  interacted: boolean;
}

export type TemporalEvent =
  | { type: "hover"; index: number | null }
  | { type: "select"; index: number }
  | { type: "enter"; index?: number }
  | { type: "escape" }
  | { type: "travel" }
  | { type: "present"; index: number }
  | { type: "entered" }
  | { type: "exited" };

export const initialState = (present = 0): TemporalState => ({
  mode: "observe",
  focus: null,
  hover: null,
  present,
  interacted: false,
});

const browsing = (mode: TemporalMode) => mode === "observe" || mode === "focus";

export function reduce(state: TemporalState, event: TemporalEvent): TemporalState {
  switch (event.type) {
    case "hover":
      if (!browsing(state.mode) || state.hover === event.index) return state;
      return { ...state, hover: event.index };
    case "select":
      if (!browsing(state.mode)) return state;
      if (state.mode === "focus" && state.focus === event.index) return state;
      return { ...state, mode: "focus", focus: event.index, interacted: true };
    case "enter": {
      if (state.mode === "exiting") return { ...state, mode: "entering" };
      if (!browsing(state.mode)) return state;
      const index = event.index ?? state.focus ?? state.hover ?? state.present;
      return { ...state, mode: "entering", focus: index, hover: null, interacted: true };
    }
    case "escape":
      if (state.mode === "entering" || state.mode === "inside") return { ...state, mode: "exiting" };
      if (state.mode === "focus") return { ...state, mode: "observe", focus: null };
      return state;
    case "travel":
      if (state.mode === "focus") return { ...state, mode: "observe", focus: null, interacted: true };
      return state.interacted || !browsing(state.mode) ? state : { ...state, interacted: true };
    case "present":
      return state.present === event.index ? state : { ...state, present: event.index };
    case "entered":
      return state.mode === "entering" ? { ...state, mode: "inside" } : state;
    case "exited":
      return state.mode === "exiting" ? { ...state, mode: "focus" } : state;
  }
}

export type Listener = () => void;

export interface TemporalStore {
  getState(): TemporalState;
  dispatch(event: TemporalEvent): void;
  subscribe(listener: Listener): () => void;
}

/** A tiny observable store; React reads it through useSyncExternalStore. */
export function createTemporalStore(initial: TemporalState): TemporalStore {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    dispatch(event) {
      const next = reduce(state, event);
      if (next === state) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
