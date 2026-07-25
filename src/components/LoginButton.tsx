"use client";
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { createClient, User } from "@supabase/supabase-js";
import { GOOGLE_CLIENT_ID, loadGis, makeNonce } from "@/lib/googleAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

export function LoginButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
      setLoading(false);
    };
    getUser();
    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Call API route to register user in user_step_fulfillment
        try {
          await fetch('/api/user-steps/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: session.user.id })
          });
        } catch {
          // Optionally handle/log error
        }
      }
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return null;
  }

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center justify-center overflow-hidden bg-surface-0 p-0"
            style={{ width: 38, height: 38, border: 'none' }}
          >
            {user.user_metadata?.avatar_url && !imgError ? (
              <Image
                src={user.user_metadata.avatar_url}
                alt="Profile"
                width={38}
                height={38}
                className="object-cover"
                style={{ width: 38, height: 38, border: 'none' }}
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-ink text-base font-normal uppercase">
                {user.user_metadata?.name?.[0] || user.email?.[0] || 'U'}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-surface-0 border border-line-strong text-ink min-w-[8rem] p-1"
        >
          <DropdownMenuItem
            className="px-3 py-2 hover:bg-surface-2 focus:bg-surface-2 text-ink text-sm flex items-center gap-2"
            onClick={async () => {
              setLoading(true); // Prevent drawing login button after logout
              await supabase.auth.signOut();
              window.location.reload();
            }}
          >
            Logout
            <LogOut className="w-4 h-4 opacity-80 ml-auto" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return <GoogleSignIn onError={setSignInError} error={signInError} />;
}

/** Google's four-colour "G", the one mark their branding terms allow. */
function GoogleMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

// Sign in with Google, wearing this app's clothes.
//
// Google's rendered button lives inside an accounts.google.com iframe, so no app
// CSS reaches it — its Roboto, its fill, its corner radius are all untouchable
// from here. Framing it only produced a default-looking Google button in a box.
//
// So the app draws the button, and Google's real one is laid over it at zero
// opacity to take the click. That is the supported shape of this: the iframe is
// what carries the credential back, and the visible control keeps their mark.
//
// The label is the app's own "Login", not one of Google's approved strings
// ("Sign in with Google", "Continue with Google", "Sign in") — a deliberate
// call, noted here so it is not mistaken for an oversight.
//
// Consequences worth knowing:
//   - The wrapper is a fixed box; Google's button is rendered LARGER than it and
//     centred, so the invisible hit area always covers the visible one, corner
//     rounding included. Keep BOX inside HIT on both axes if either is touched.
//   - GIS clamps its own width to a 200px minimum, so at a narrow BOX the click
//     layer spills well past the button — overflow-hidden on the wrapper is what
//     clips it, for hit-testing as well as for paint. It is load-bearing.
//   - Hover and focus live on the wrapper, not the drawn button: the real focus
//     target is the iframe, which :focus-within still sees.
//   - The account chooser that opens next is Google's own page on their domain.
//     Nothing here changes it; only the OAuth Branding fields do.
const BOX = { width: 96, height: 38 };
// Google renders 44px tall at size "large" and never narrower than 200 — an
// overhang on every edge of BOX, which the wrapper then clips.
const HIT_WIDTH = 240;

function GoogleSignIn({
  onError,
  error,
}: {
  onError: (m: string | null) => void;
  error: string | null;
}) {
  const slot = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadGis();
        if (cancelled || !slot.current) return;
        const id = window.google?.accounts?.id;
        if (!id) throw new Error("Google Identity Services unavailable");

        // Google gets the hash, Supabase gets the raw value; see makeNonce.
        const { raw, hashed } = await makeNonce();

        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: hashed,
          cancel_on_tap_outside: true,
          callback: async (res) => {
            onError(null);
            const { error: err } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: res.credential,
              nonce: raw,
            });
            // The auth listener above picks the session up; only failure needs
            // handling here.
            if (err) onError(err.message);
          },
        });

        // Rendered only to be clicked through, never seen — but sized generously
        // so its hit area outruns the drawn button on every side.
        id.renderButton(slot.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: HIT_WIDTH,
        });
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : "Sign-in unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onError]);

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="max-w-[16rem] truncate text-meta text-danger" title={error}>
          {error}
        </span>
      )}
      <div
        className="group relative cursor-pointer overflow-hidden leading-none
                   focus-within:outline focus-within:outline-2 focus-within:outline-line-active"
        style={BOX}
      >
        {/* What the user sees. Inert: the click belongs to the layer above it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2
                     border border-line-strong bg-surface-1 text-meta font-medium text-ink-muted backdrop-blur-md
                     transition-colors duration-150
                     group-hover:border-line-active group-hover:bg-surface-2 group-hover:text-ink"
        >
          <GoogleMark />
          Login
        </div>
        {/* Google's real button: invisible, centred, larger than the box. */}
        <div
          ref={slot}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0"
        />
      </div>
    </div>
  );
}
