import { NextResponse } from 'next/server';
import { getUserChatMessages } from '@/app/api/supabase/chat-message';
import { requireUser } from "@/lib/apiAuth";

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  try {
    const { limit } = await request.json();
    const { data, error } = await getUserChatMessages(who.userId, limit ?? 50);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ messages: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch chat history', details: String(error) }, { status: 500 });
  }
}
