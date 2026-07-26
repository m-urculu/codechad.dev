import { NextResponse } from 'next/server';
import { registerUserStepFulfillment } from '@/app/api/supabase/user-steps';
import { requireUser } from '@/lib/apiAuth';

// The user_id that used to arrive in the body is ignored; it was the only thing
// this route trusted.
export async function POST(req: Request) {
  const who = await requireUser(req);
  if ("error" in who) return who.error;

  try {
    await registerUserStepFulfillment(who.userId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
      message = (error as { message: string }).message;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
