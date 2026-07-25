"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { createClient, User } from "@supabase/supabase-js";
import { completeGoogleRedirect, startGoogleRedirect } from "@/lib/googleAuth";

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
    const start = async () => {
      // A returning redirect has to be spent before asking who is signed in —
      // otherwise getUser answers "nobody" for the tokenful load and the button
      // flashes back before the session lands.
      const back = completeGoogleRedirect();
      if (back && "error" in back) {
        setSignInError(back.error);
      } else if (back) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: back.idToken,
          nonce: back.nonce,
        });
        if (error) setSignInError(error.message);
      }

      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
      setLoading(false);
    };
    start();
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

// An ordinary button. Nothing of Google's is rendered here — no script, no
// iframe, no popup — because the flow is a full-page redirect: this navigates
// away to accounts.google.com and the app is remounted with an ID token in the
// fragment, which the effect above spends.
//
// The one thing that is still Google's is the account chooser the browser lands
// on. Only the OAuth Branding fields reach it.
function GoogleSignIn({
  onError,
  error,
}: {
  onError: (m: string | null) => void;
  error: string | null;
}) {
  const [leaving, setLeaving] = useState(false);

  const go = async () => {
    onError(null);
    setLeaving(true);
    try {
      await startGoogleRedirect();
    } catch (e) {
      // Only reached if the redirect never happens; otherwise the page is gone.
      setLeaving(false);
      onError(e instanceof Error ? e.message : "Sign-in unavailable");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="max-w-[16rem] truncate text-meta text-danger" title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={go}
        disabled={leaving}
        className="flex h-[38px] items-center justify-center border border-line-strong bg-surface-1 px-5
                   text-meta font-medium text-ink-muted backdrop-blur-md
                   transition-colors duration-150
                   hover:border-line-active hover:bg-surface-2 hover:text-ink
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active
                   disabled:opacity-60"
      >
        {leaving ? "Redirecting…" : "Login"}
      </button>
    </div>
  );
}
