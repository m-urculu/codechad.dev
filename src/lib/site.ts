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

// The canonical origin. Overridable per-environment via NEXT_PUBLIC_SITE_URL
// (preview deployments), but the default is the real domain: Google rejects
// *.vercel.app for verification, because a free hosting subdomain is not
// registered to you.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://codechad.dev"
).replace(/\/$/, "");

/** Host without the scheme, for display in prose. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

export const CONTACT_EMAIL = "marceloheoliveira@gmail.com";
