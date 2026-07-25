import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The app had no robots.txt, so Cloudflare was serving one of its own: the origin
// returns 404 for /robots.txt while the edge returns 200 with Cloudflare's
// "content signals" policy. That policy reserves rights against AI crawlers,
// which is a position this site has no reason to take while it is trying to get
// its home page read by a verification crawler.
//
// Declaring our own makes the intent explicit and puts the file back under the
// app's control. It does not, by itself, switch off any bot-blocking rule in the
// Cloudflare dashboard — those run before the request ever reaches here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
