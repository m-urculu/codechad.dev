"use client";
import React, { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { createClient, User } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

export function LoginButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

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
        } catch (err) {
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
            className="flex items-center justify-center overflow-hidden bg-black p-0 cursor-pointer"
            style={{ width: 38, height: 38, border: 'none' }}
          >
            {user.user_metadata?.avatar_url && !imgError ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="Profile"
                className="object-cover"
                style={{ width: 38, height: 38, border: 'none' }}
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-white text-[16px] font-normal uppercase">
                {user.user_metadata?.name?.[0] || user.email?.[0] || 'U'}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-neutral-900 border border-white/10 text-white font-mono min-w-[8rem] p-1"
        >
          <DropdownMenuItem
            className="px-3 py-2 hover:bg-black focus:bg-black text-white font-mono cursor-pointer flex items-center gap-2"
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

  return (
    <button
      className="px-4 py-2 text-white font-mono font-normal text-sm shadow-md hover:from-blue-500 hover:to-purple-600 transition-colors cursor-pointer border border-white/10 bg-black hover:bg-neutral-700"
      style={{ fontFamily: "var(--font-mono)" }}
      onClick={() => window.location.href = "/api/auth/google"}
    >
      Login
    </button>
  );
}
