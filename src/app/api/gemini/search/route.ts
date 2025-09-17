// src/app/api/gemini/search/route.ts
// API Route: /api/gemini/search - Endpoint to Call Gemini API


import { NextResponse } from 'next/server';

// Gemini search function using Gemini API

import { GoogleGenAI } from "@google/genai";

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
  if (response && response.candidates && response.candidates[0]?.content?.parts[0]?.text)
    return response.candidates[0].content.parts[0].text;
  return JSON.stringify(response);
}

// POST /api/gemini/search
export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid query' }, { status: 400 });
    }
    const result = await geminiSearch(query);
    console.log('Gemini Search Response:', result);
    if (!result) {
      return NextResponse.json({ error: 'Failed to get response from Gemini.' }, { status: 500 });
    }
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}