// Central Gemini model choice + free-tier fallback order.
//
// Free-tier daily request quota is PER MODEL (GenerateRequestsPerDayPerProjectPerModel).
// The "latest" aliases point at the newest models, which have the SMALLEST free
// daily caps (e.g. gemini-3.6-flash = 20/day). So we prefer higher-throughput lite
// models first and fall through to others when one model's daily cap is hit (429).
//
// Order = try first → last. Callers that get a 429 should advance to the next model.
//
// Free-tier daily caps (RPD) from the AI Studio rate-limit dashboard, 2026-07:
//   Flash-Lite (3.5 / 3.1) .......... 500/day each   ← workhorses: 25× the Flash cap
//   Flash (3.6 / 3.5 / 3 / 2.5) ...... 20/day each
//   Gemma 4 (26B / 31B) .............. 14,400/day each (huge, but weaker at strict JSON)
// So we lead with the 500/day Flash-Lite models (capable AND honor responseMimeType
// JSON), fall back to the 20/day Flash models, and only then to Gemma as a
// high-volume last resort. Explicit model ids (not *-latest aliases) so the chain
// can't silently drift onto a 20/day model.
export const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",   // 500/day
  "gemini-3.1-flash-lite",   // 500/day
  "gemini-3.5-flash",        // 20/day
  "gemini-3-flash-preview",  // 20/day
  "gemma-4-31b-it",          // 14,400/day (last resort; may need JSON repair)
] as const;

// Single default for call sites that don't implement fallback themselves.
export const GEMINI_MODEL = GEMINI_MODELS[0];
