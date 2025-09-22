// src/app/api/gemini/search/route.ts
// API Route: /api/gemini/search - Endpoint to Call Gemini API

import { NextResponse } from 'next/server';

// Gemini search function using Gemini API

import { GoogleGenAI } from "@google/genai";
import { insertChatMessage } from "@/app/api/supabase/chat-message";

// Gemini search function using GoogleGenAI with grounding (real search)
async function geminiSearch(query: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable not set.');
  }
  const ai = new GoogleGenAI({ apiKey });
  const groundingTool = { googleSearch: {} };
  const config = { tools: [groundingTool] };
  const model = "gemini-2.5-flash";
  const response = await ai.models.generateContent({
    model,
    contents: query,
    config,
  });
  // The response object may differ depending on the SDK version
  // Try to extract the text in a robust way
  if (response && response.text) return response.text;
  if (
    response &&
    Array.isArray(response.candidates) &&
    response.candidates.length > 0 &&
    response.candidates[0]?.content?.parts &&
    Array.isArray(response.candidates[0].content.parts) &&
    response.candidates[0].content.parts.length > 0 &&
    typeof response.candidates[0].content.parts[0]?.text === 'string'
  ) {
    return response.candidates[0].content.parts[0].text;
  }
  return JSON.stringify(response);
}

// POST /api/gemini/search
export async function POST(request: Request) {
  try {
    const { query, user_id } = await request.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid query' }, { status: 400 });
    }
    const result = await geminiSearch(query);
    // Remove all leading 'Assistant:' if present and ensure string
    let cleanResult = result;
    if (typeof cleanResult === 'string') {
      cleanResult = cleanResult.replace(/^(Assistant:\s*)+/i, '');
    }
    if (cleanResult == null) cleanResult = '';
    
    // Store assistant message
    if (user_id) {
      await insertChatMessage({ user_id, role: 'assistant', content: cleanResult });
    }
    return NextResponse.json({ result: cleanResult });
  } catch (e: unknown) {
    console.error('Search function error:', e);
    // Handle Gemini API overload (503)
    let message = '';
    if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
      message = (e as { message: string }).message;
    }
    if (message.includes('model is overloaded')) {
      return NextResponse.json({ error: 'The search service is temporarily unavailable due to high load. Please try again in a few moments.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error', details: String(e) }, { status: 500 });
  }
}