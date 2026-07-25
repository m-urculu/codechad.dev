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

// Google's own button, because Sign in with Google has to be presented as Google's
// button. `filled_black` + `rectangular` is the closest of its presets to the rest
// of the app: black fill, square corners, no radius to fight. It renders inside an
// iframe, so app CSS cannot reach it — the preset is the only lever.
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

        id.renderButton(slot.current, {
          type: "standard",
          theme: "filled_black",
          size: "medium",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
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
      <div ref={slot} />
    </div>
  );
}
