import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only the three public, crawlable pages. Everything else in the app is behind a
// sign-in or is per-user state, and none of it should be indexed.
//
// Worth having beyond SEO: without a sitemap or a single inbound link, a new
// domain is simply unknown to Google, which is a thin footprint for an app asking
// to be trusted on an OAuth consent screen.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
