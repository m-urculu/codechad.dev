// A ceiling on what an anonymous caller can spend.
//
// The trial lets a visitor generate a course and work a lesson without an
// account, which necessarily reopens the generation routes to callers we cannot
// identify. The trial's real boundary — "one lesson" — lives in the browser and
// is therefore advisory: it shapes the product, it does not defend it. This is
// what defends it.
//
// Deliberately per-IP and in-memory. On Vercel each serverless instance keeps
// its own map, so a caller spread across instances gets more than one bucket's
// worth — this is a speed bump against a script with the URL, not a hard quota.
// A distributed limit would mean a Redis round trip on every request, which is
// not the right trade for a free project. Signed-in callers never reach here.
import "server-only";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Sized against one honest trial run: a roadmap, a handful of node expansions, a
// lesson build, some guidance and a little read-aloud comes to roughly 30 calls.
// Double that is room to breathe; ten times it is a script.
const HOURLY_LIMIT = 60;
const BURST_LIMIT = 12;

// Above this the map is cleared wholesale rather than grown. Losing the counts
// costs a little enforcement; leaking memory on a long-lived instance costs more.
const MAX_KEYS = 20_000;

type Window = { count: number; resetAt: number };

const hourly = new Map<string, Window>();
const burst = new Map<string, Window>();

function hit(store: Map<string, Window>, key: string, limit: number, span: number): boolean {
  const now = Date.now();

  if (store.size > MAX_KEYS) store.clear();

  const w = store.get(key);
  if (!w || now >= w.resetAt) {
    store.set(key, { count: 1, resetAt: now + span });
    return true;
  }
  if (w.count >= limit) return false;
  w.count++;
  return true;
}

// Account creation is cheap for us and cheap for a script, so it gets its own,
// much tighter bucket: a person makes one account, occasionally two.
const SIGNUP_PER_HOUR = 8;
const signups = new Map<string, Window>();

/**
 * Returns a 429 when one address has created enough accounts for an hour.
 *
 * Separate from the trial allowance on purpose — spending a trial should not
 * make signing up impossible, and a signup script should not be handed the
 * trial's 60 calls before it is noticed.
 */
export function signupRateLimit(request: Request): Response | null {
  if (hit(signups, clientIp(request), SIGNUP_PER_HOUR, HOUR)) return null;

  return new Response(
    JSON.stringify({ error: "Too many accounts from here. Try again in an hour." }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(HOUR / 1000) },
    }
  );
}

/** The caller's address as far as the platform will tell us. */
function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  // Vercel prepends the real client; anything after it is upstream proxies.
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns a 429 when an anonymous caller has spent its allowance, otherwise null.
 *
 * The message is written to be shown to a person, because it will be: the client
 * surfaces it as the reason to sign in.
 */
export function anonRateLimit(request: Request): Response | null {
  const ip = clientIp(request);

  const okBurst = hit(burst, ip, BURST_LIMIT, MINUTE);
  const okHour = hit(hourly, ip, HOURLY_LIMIT, HOUR);
  if (okBurst && okHour) return null;

  return new Response(
    JSON.stringify({
      error: "Free trial limit reached. Sign in to keep going — it's free.",
      code: "trial_limit",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": okBurst ? String(HOUR / 1000) : "60",
      },
    }
  );
}
