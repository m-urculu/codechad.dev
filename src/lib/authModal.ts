// The login modal, openable from anywhere.
//
// It lives inside LoginButton in the nav, but the moments worth asking for an
// account happen deep in the workspace — finishing the trial lesson, reaching for
// a second one. Rather than thread a callback down through EditorPanels and
// ChatPanel, the modal reads its open state from here. Same external-store shape
// as the read-aloud player in tts.ts.
//
// `reason` is the sentence shown above the providers. It is why the modal opened,
// in the learner's terms, and it is what makes the prompt feel earned rather than
// thrown up at them.

export type AuthModalState = { open: boolean; reason: string | null };

const CLOSED: AuthModalState = { open: false, reason: null };

let state: AuthModalState = CLOSED;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// Must return a stable reference while nothing changes, or useSyncExternalStore
// re-renders forever — hence the shared CLOSED constant rather than a fresh
// object each call.
export function getSnapshot(): AuthModalState {
  return state;
}

export function getServerSnapshot(): AuthModalState {
  return CLOSED;
}

export function openLogin(reason?: string) {
  state = { open: true, reason: reason ?? null };
  emit();
}

export function closeLogin() {
  if (state === CLOSED) return;
  state = CLOSED;
  emit();
}
