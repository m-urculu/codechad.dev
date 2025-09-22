// src/app/api/sys-manager/route.ts
import { NextResponse } from 'next/server';
import { POST as chatHandler } from '@/app/api/functions/chat/route';
import { POST as searchHandler } from '@/app/api/functions/search/route';
import * as roadmapHandlers from '@/app/api/functions/roadmap/index';
import { callGemini } from '@/lib/gemini';
import { getUserChatMessages, insertChatMessage } from '@/app/api/supabase/chat-message';
import { createClient } from '@supabase/supabase-js';

const functionMap: Record<string, (request: Request) => Promise<Response>> = {
  chat: chatHandler,
  search: searchHandler,
  define_roadmaps: roadmapHandlers.define_roadmaps,
  // Add more functions as needed
};


// Helper to fetch user step fulfillment from Supabase
async function getUserStepFulfillment(user_id: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!, process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!);
  const { data, error } = await supabase
    .from('user_step_fulfillment')
    .select('define_roadmaps_done, define_project_done, course_nodes_gen_done')
    .eq('user_id', user_id)
    .single();
  if (error) {
    console.error('Error fetching user_step_fulfillment:', error);
    return null;
  }
  return data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user_input, user_id } = body;
    if (!user_input || typeof user_input !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid user_input' }, { status: 400 });
    }

    // Store the user message in the database before sending to Gemini
    if (user_input && user_id) {
      await insertChatMessage({
        user_id,
        role: "user",
        content: user_input,
      });
    }
    // Retrieve previous messages for the user
  let previousMessages: unknown[] = [];
    if (user_id) {
      const { data, error } = await getUserChatMessages(user_id, 20);
      if (error) {
        console.error('Error retrieving previous messages:', error);
      } else {
        previousMessages = data || [];
      }
    }

    // Retrieve user step fulfillment and determine next step
    let nextStep = null;
    let step = null;
    if (user_id) {
      step = await getUserStepFulfillment(user_id);
      if (step) {
        if (!step.define_roadmaps_done) nextStep = 'define_roadmaps';
        else if (!step.define_project_done) nextStep = 'define_project';
        else if (!step.course_nodes_gen_done) nextStep = 'course_nodes_gen';
      }
    }

    // Build SYSTEM_INSTRUCTIONS dynamically
    let SYSTEM_INSTRUCTIONS = `You are a system manager. Given a user message, decide which function to call: 'chat' for general conversation, 'search' for information lookup`;
    if (nextStep) {
      SYSTEM_INSTRUCTIONS += `, or '${nextStep}' for the next step in the user's journey`;
    }
    SYSTEM_INSTRUCTIONS += `.\nRespond in JSON: { "function": "chat|search${nextStep ? '|' + nextStep : ''}", "message": "<user message to pass>" }`;

    // 1. Ask Gemini which function to call
    const geminiPrompt = `${SYSTEM_INSTRUCTIONS}\nPrevious messages: ${JSON.stringify(previousMessages)}\nUser: ${user_input}`;
    const geminiResponse = await callGemini(geminiPrompt);

    // 2. Parse Gemini's response for function and message

  let parsed;
  const safeGeminiResponse = geminiResponse == null ? '' : geminiResponse;
    try {
      parsed = JSON.parse(safeGeminiResponse);
    } catch {
      return NextResponse.json({ error: 'Gemini did not return valid JSON', geminiResponse: safeGeminiResponse }, { status: 500 });
    }
    const { function: fn, message } = parsed;
    if (!fn || !functionMap[fn]) {
      return NextResponse.json({ error: 'Invalid function from Gemini', fn, geminiResponse }, { status: 400 });
    }

    // 3. Route to the correct function, including previousMessages in the payload
    const handler = functionMap[fn];
    let handlerPayload;
    if (fn === 'chat') {
      // Only use the original frontend user_input as the prompt for chat
      handlerPayload = { prompt: user_input, user_id, previousMessages, userSteps: step };
    } else if (fn === 'define_roadmaps') {
      handlerPayload = { user_id, message, previousMessages, userSteps: step };
    } else {
      handlerPayload = { query: message, user_id, previousMessages };
    }
    const handlerRequest = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(handlerPayload),
    });
    // Await the handler and forward error status/details if present
    const handlerResponse = await handler(handlerRequest);
    const handlerData = await handlerResponse.json();
    if (!handlerResponse.ok) {
      // Forward error and status from downstream function
      return NextResponse.json(handlerData, { status: handlerResponse.status });
    }
    return NextResponse.json(handlerData);
  } catch (error) {
    console.error('[sys-manager] Error:', error);
    return NextResponse.json({ error: 'System manager error', details: String(error) }, { status: 500 });
  }
}