import { NextResponse } from 'next/server';
import { getUserChatMessages } from '@/app/api/supabase/chat-message';

export async function POST(request: Request) {
  try {
    const { user_id, limit } = await request.json();
    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid user_id' }, { status: 400 });
    }
    const { data, error } = await getUserChatMessages(user_id, limit ?? 50);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ messages: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch chat history', details: String(error) }, { status: 500 });
  }
}
