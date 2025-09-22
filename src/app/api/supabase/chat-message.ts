// src/app/api/supabase/chat-message.ts
// Server utility to insert a chat message into Supabase

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

/**
 * Insert a chat message into the chat_messages table
 * @param user_id uuid of the user
 * @param role 'user' | 'assistant' | 'system' | 'tool'
 * @param content message content
 * @returns Promise<{ error: any, data: any }>
 */
export async function insertChatMessage({ user_id, role, content }: { user_id: string, role: string, content: string }) {
  // console.log('[insertChatMessage] Received:', { user_id, role, content });
  // If logging Gemini responses, only log when role is 'assistant'
  if (role === 'assistant') {
    // console.log('[insertChatMessage] Gemini response:', content);
  }
  const { data, error } = await supabase
    .from('chat_messages')
    .insert([{ user_id, role, content }]);
  return { data, error };
}

/**
 * Get previous chat messages for a user, ordered by created_at ascending
 * @param user_id uuid of the user
 * @param limit number of messages to retrieve (default 20)
 * @returns Promise<{ error: any, data: any }>
 */
export async function getUserChatMessages(user_id: string, limit = 20) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role,content,created_at')
    .eq('user_id', user_id)
    .order('created_at', { ascending: true })
    .limit(limit);
  return { data, error };
}

// Test DB connection by selecting 1 row from chat_messages
export async function testDbConnection() {
  try {
    const { data, error } = await supabase.from('chat_messages').select('*').limit(1);
    if (error) {
      console.error('Supabase DB connection error:', error);
    } else {
    }
    return { data, error };
  } catch (e) {
    console.error('Supabase DB connection exception:', e);
    return { data: null, error: e };
  }
}
