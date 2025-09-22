import { NextResponse } from 'next/server';
import { registerUserStepFulfillment } from '@/app/api/supabase/user-steps';

export async function POST(req: Request) {
  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }
    await registerUserStepFulfillment(user_id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
      message = (error as { message: string }).message;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
