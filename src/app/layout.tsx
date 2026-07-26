import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Leads with the app name exactly as configured on the OAuth consent screen —
  // Google's review compares the two and rejects a mismatch.
  title: `${SITE_NAME} — learn programming by doing, live in your browser`,
  description: `${SITE_NAME} builds you a personalised learning roadmap for a programming language or database, then teaches it lesson by lesson with an AI tutor and an editor that runs your code in the browser.`,
  applicationName: SITE_NAME,
  // The apex 308s to www, so both spellings of every URL exist. This names the
  // www one as the real address, which is also the one registered as the OAuth
  // home page and listed in the sitemap — three places that must agree.
  alternates: { canonical: "/" },
  icons: { icon: "/logo.svg" },
  // og:site_name is the other place an automated check looks for an app's name.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    url: SITE_URL,
    description: `${SITE_NAME} builds you a personalised learning roadmap for a programming language or database, then teaches it lesson by lesson with an AI tutor and an editor that runs your code in the browser.`,
  },
  // Google Search Console ownership proof. Google Cloud will only accept an
  // authorized domain for the OAuth consent screen once the domain is verified,
  // and the meta-tag method is the one that works for a *.vercel.app host.
  // Set GOOGLE_SITE_VERIFICATION in Vercel; the tag is omitted when unset.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Structured data, so the app's identity is machine-readable rather than
            inferred from prose. Google's OAuth branding review checks that the
            consent screen's app name matches the home page; this states the name,
            the URL and the purpose in a form that needs no scraping. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- static, no user input
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: SITE_NAME,
              alternateName: `${SITE_NAME} — learn programming by doing`,
              url: SITE_URL,
              applicationCategory: "EducationalApplication",
              operatingSystem: "Any (runs in a web browser)",
              description: `${SITE_NAME} is a free, browser-based app for learning programming languages and databases. It builds a personalised learning roadmap from your goal, then teaches it lesson by lesson with an AI tutor and an editor that runs your code live in the browser.`,
              offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
              privacyPolicy: `${SITE_URL}/privacy`,
              termsOfService: `${SITE_URL}/terms`,
            }),
          }}
        />
      </head>
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
