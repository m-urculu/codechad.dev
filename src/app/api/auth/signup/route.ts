// Creates an account that can be used immediately.
//
//   POST /api/auth/signup { email, password } -> { ok } | 409 { code: "email_taken" }
//
// Why this exists rather than supabase.auth.signUp() in the browser: the project
// has email confirmations switched on, so signUp returns a user with no session
// and signInWithPassword then refuses with "Email not confirmed". A visitor who
// has just finished a free lesson would be told to go and check their inbox — and
// the roadmap, chat and progress they built while signed out only survive if a
// session appears in that same tab. Sending them away loses the work the account
// was for.
//
// So the account is created here, server-side, with the address pre-marked as
// confirmed. Nothing else about auth changes: the browser still signs in with the
// password through the normal endpoint and gets a normal session.
//
// This deliberately trades away proof that the address is real — anything with an
// @ in it becomes an account. That is the intent for now (the trial has to be
// able to keep someone's work), and it is the one line to revisit when
// confirmation is implemented: drop `email_confirm` and this route stops
// short-circuiting the flow.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signupRateLimit } from "@/lib/rateLimit";

// Deliberately loose. Real validation of an address is delivery, which is
// exactly what is not happening yet; this only catches obvious typos.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

export async function POST(request: Request) {
  const limited = signupRateLimit(request);
  if (limited) return limited;

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Already registered. The caller handles this by trying to sign in instead:
    // if the password is theirs they are simply let in, which is what someone
    // typing their own details into the wrong tab of the form meant to happen.
    const taken =
      error.status === 422 ||
      /already (been )?registered|already exists/i.test(error.message);
    if (taken) {
      return NextResponse.json(
        { error: "That email already has an account.", code: "email_taken" },
        { status: 409 }
      );
    }
    console.error("[auth/signup]", error.status, error.message);
    return NextResponse.json(
      { error: "Could not create the account. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
