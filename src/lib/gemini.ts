// src/lib/gemini.ts
// Library: Gemini API Interaction Module

import fetch from 'node-fetch';

async function getGeminiResponse(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = 'gemini-2.5-flash'; // gemini-2.0-flash is retired (404)

  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable not set.');
    return null;
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status} - ${response.statusText}`);
      const errorData = await response.json();
      console.error('Error details:', errorData);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Remove Markdown code fences if present
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
      return rawText.substring(jsonStart, jsonEnd + 1);
    } else {
      console.warn('Could not find valid JSON boundaries in Gemini response:', rawText);
      return rawText; // Return the raw text in case it's valid JSON without fences
    }

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return null;
  }
}

export async function callGemini(prompt: string) {
  const response = await getGeminiResponse(prompt);
  if (response) {
    console.log('Gemini Response (Processed):', response);
    return response;
  } else {
    console.log('Failed to get a response from Gemini.');
    return null;
  }
}