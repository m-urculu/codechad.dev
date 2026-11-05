import { useSyncExternalStore } from "react";

// Nothing to subscribe to: these values are fixed for the life of the page.
const subscribe = () => () => {};
const probed = new Map<() => unknown, unknown>();

/**
 * A value that can only be computed in the browser — a WebGL capability probe, or
 * simply "is there a document yet?".
 *
 * The server render and hydration use `serverValue`, so the two agree; the browser then
 * re-renders with the probed value. That is what `useEffect(() => setX(probe()), [])`
 * did, without setting state from inside an effect. Each probe runs once per page load,
 * so `probe` must be a stable, module-level function.
 */
export function useClientValue<T>(probe: () => T, serverValue: T): T {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!probed.has(probe)) probed.set(probe, probe());
      return probed.get(probe) as T;
    },
    () => serverValue
  );
}
