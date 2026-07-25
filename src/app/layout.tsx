import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CodePath — learn by doing, live in your browser",
  description:
    "Hands-on learning for programming and tech skills: real code, real databases, real output — with an AI tutor beside you.",
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
