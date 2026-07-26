// How far a visitor gets without an account.
//
// The trial is one completed lesson: generate a course, talk to the tutor, work
// the first lesson to the end. Finishing it is the moment there is something
// worth keeping, and the moment we ask — nothing a signed-out visitor does is
// persisted, so the ask is honest rather than a toll gate.
//
// This flag is a product boundary, not a security one. It is a localStorage key;
// anyone can clear it, and clearing it grants another trial. That is fine — the
// cost of an anonymous run is capped server-side by the rate limiter in
// src/lib/rateLimit.ts, which is where abuse is actually answered.

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
