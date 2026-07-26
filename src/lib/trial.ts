// Whether this visitor has already finished a lesson without an account.
//
// The trial is one completed lesson: generate a course, talk to the tutor, work
// the first lesson to the end. Finishing it is the moment there is something
// worth keeping, and the only moment we ask — nothing a signed-out visitor does
// is persisted, so the ask is honest rather than a toll gate.
//
// It does not gate anything. Opening a further lesson signed out is allowed; the
// prompt simply recurs on each completion, and this flag only decides whether it
// says "first lesson done" or acknowledges there have been several. The cost of
// an anonymous run is capped server-side by src/lib/rateLimit.ts, which is where
// abuse is actually answered — not here, in a localStorage key anyone can clear.

const KEY = "codechad:trial-used";

export function isTrialUsed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // Private mode, disabled storage — fail open. A visitor who cannot store the
    // flag should get the trial, not be locked out of it.
    return false;
  }
}

export function markTrialUsed() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* nothing to do — see above */
  }
}
