import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CodePath — learn by doing, live in your browser",
  description:
    "Hands-on learning for programming and tech skills: real code, real databases, real output — with an AI tutor beside you.",
  icons: { icon: "/logo.svg" },
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
