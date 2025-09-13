// src/app/api/gemini/route.ts
// API Route: /api/gemini - Endpoint to Call Gemini API

import { callGemini } from '@/lib/gemini';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required in the request body.' }, { status: 400 });
    }

    const geminiResponse = await callGemini(prompt);
    return NextResponse.json({ response: geminiResponse });

  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error handling Gemini request:', error);
      return NextResponse.json({ error: 'Failed to get response from Gemini.' }, { status: 500 });
    } else {
      console.error('Unknown error handling Gemini request:', error);
      return NextResponse.json({ error: 'Failed to get response from Gemini.' }, { status: 500 });
    }
  }
}