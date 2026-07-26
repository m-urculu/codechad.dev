import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Every host a signed-in user's avatar can come from. An OAuth provider missing
    // from this list doesn't degrade — the optimizer answers 400 and the nav falls
    // back to an initial — so it must be extended whenever a provider is added.
    remotePatterns: [
      // Google account avatars (Supabase OAuth)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // GitHub account avatars, uploaded and generated identicons alike
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
