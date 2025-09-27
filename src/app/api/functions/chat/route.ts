// src/app/api/gemini/route.ts
// API Route: /api/gemini - Endpoint to Call Gemini API

import { callGemini } from '@/lib/gemini';
import { NextResponse } from 'next/server';
import { insertChatMessage } from "@/app/api/supabase/chat-message";


// Gemini chat function
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, user_id, previousMessages, userSteps } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required in the request body.' }, { status: 400 });
    }

    // Determine which user step is incomplete and build a preamble if needed
    let preamble = '';
    if (userSteps) {
      if (userSteps.define_roadmaps_done === false) {
        preamble = 'Before continuing, please ask the user to define their job or skills goals within the software development market. Here are some common archetypes you can choose from: Backend Developer, Frontend Developer, Full Stack Developer, DevOps Engineer, Data Scientist, AI Engineer, Mobile Developer, Game Developer, Software Architect, Product Manager, Technical Writer, QA Engineer, UX Designer, Blockchain Developer, Cyber Security Specialist. If none fit, describe your own. Check if the skills are well-defined otherwise re-ask for clarification.\n';
      } else if (userSteps.define_project_done === false) {
        preamble = 'Before continuing, please ask the user to define their project.\n';
      }
    }

    // Build full prompt with preamble, previousMessages, and user prompt
    let chatHistory = '';
    if (Array.isArray(previousMessages) && previousMessages.length > 0) {
      chatHistory = previousMessages.map(m => {
        if (m.role === 'user') return `User: ${m.content}`;
        if (m.role === 'assistant') return `Assistant: ${m.content}`;
        return `${m.role.charAt(0).toUpperCase() + m.role.slice(1)}: ${m.content}`;
      }).join('\n');
    }
    // Always append the current user prompt as 'User:'
    const fullPrompt = preamble + (chatHistory ? `${chatHistory}\nUser: ${prompt}` : `User: ${prompt}`);
    const geminiResponse = await callGemini(fullPrompt);
    // Post-process Gemini response: only store the assistant's reply, never any echoed user message
    let cleanGeminiResponse = geminiResponse;
    if (typeof cleanGeminiResponse === 'string') {
      // Extract only the last Assistant: block, ignore any User: blocks
      const lastAssistantIdx = cleanGeminiResponse.lastIndexOf('Assistant:');
      if (lastAssistantIdx !== -1) {
        cleanGeminiResponse = cleanGeminiResponse.slice(lastAssistantIdx + 'Assistant:'.length);
      }
      cleanGeminiResponse = cleanGeminiResponse.replace(/^(\s*Assistant:\s*)+/i, '').trim();
    }
    if (cleanGeminiResponse == null) cleanGeminiResponse = '';

    // Store only the post-processed assistant message
    if (user_id) {
      await insertChatMessage({ user_id, role: 'assistant', content: cleanGeminiResponse });
    }
    return NextResponse.json({ response: cleanGeminiResponse });

  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to get response from Gemini.' }, { status: 500 });
    } else {
      return NextResponse.json({ error: 'Failed to get response from Gemini.' }, { status: 500 });
    }
  }
}