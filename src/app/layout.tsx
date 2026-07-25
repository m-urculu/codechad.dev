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
  icons: { icon: "/logo.svg" },
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
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
