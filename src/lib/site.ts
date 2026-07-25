// The app's public identity, in one place.
//
// Google's OAuth verification checks that the name on the consent screen matches
// the name on the home page, and that the home page, privacy policy and terms all
// live on a domain registered to the developer. Both are things that get out of
// step when the same strings are retyped across pages — so they are declared once
// here and imported.
//
// SITE_NAME must match the "App name" field on the Google Auth Platform Branding
// page CHARACTER FOR CHARACTER. Changing one without the other fails verification.
export const SITE_NAME = "CodeChad";

// The canonical origin, and it must be the host that actually SERVES: the apex
// 308s to www, and a reviewer checking the home page URL against the policy
// pages should never be following a redirect to get there. This matches the
// "Application home page" field on the Branding page exactly.
//
// Overridable per-environment via NEXT_PUBLIC_SITE_URL for preview deployments.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.codechad.dev"
).replace(/\/$/, "");

/** Host without the scheme, for display in prose. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

export const CONTACT_EMAIL = "marceloheoliveira@gmail.com";
