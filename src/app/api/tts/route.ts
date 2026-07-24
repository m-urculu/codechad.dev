// POST /api/tts — natural neural speech via Microsoft Edge's online "read aloud" voices.
// Free, no API key. We open a WebSocket to Microsoft's synthesis endpoint (the same one
// Edge's Read Aloud uses), authenticate with the required Sec-MS-GEC token, send SSML, and
// stream the MP3 audio back to the browser. This is an UNOFFICIAL endpoint — if Microsoft
// changes it, the client falls back to the browser's native voice.
//   Body: { text: string, voice?: string } -> audio/mpeg
//
// Note: neural voices are named like "en-US-AriaNeural", "en-US-GuyNeural", etc.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import WebSocket from "ws";

export const runtime = "nodejs";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION = "1-140.0.3485.14";
// Microsoft rejects a stale Edge User-Agent (old builds → 403), so keep this current.
const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
const WSS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const DEFAULT_VOICE = "en-US-AriaNeural";
const WIN_EPOCH_OFFSET = 11644473600; // seconds between 1601-01-01 and 1970-01-01

// Microsoft's DRM token: SHA-256 of (Windows file-time rounded to 5 min + trusted token).
// IMPORTANT: this must mirror the reference (edge-tts) computation exactly — it uses float64
// arithmetic, which loses precision past ~1e17, and Microsoft's server validates against
// that same float value. BigInt (mathematically exact) yields a different hash and 403s.
function generateSecMsGec(): string {
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH_OFFSET; // seconds since 1601 epoch
  ticks -= ticks % 300; // round down to the nearest 5 minutes
  ticks *= 1e9 / 100; // seconds → 100-ns units (as float64, on purpose)
  return crypto
    .createHash("sha256")
    .update(ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN, "ascii")
    .digest("hex")
    .toUpperCase();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSSML(text: string, voice: string): string {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'><prosody rate='0%' pitch='0%'>${escapeXml(text)}</prosody></voice></speak>`
  );
}

function synthesize(text: string, voice: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const gec = generateSecMsGec();
    const url =
      `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const ws = new WebSocket(url, {
      headers: {
        "User-Agent": EDGE_UA,
        Origin: "chrome-extension://jdiccldimpahjkljnbnaokmjkeejnjno",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("edge-tts timeout"));
    }, 20000);

    ws.on("open", () => {
      const ts = new Date().toString();
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );
      const reqId = crypto.randomUUID().replace(/-/g, "");
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n` +
          buildSSML(text, voice)
      );
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // Binary frame: [2-byte big-endian header length][header][audio bytes].
        if (data.length < 2) return;
        const headerLen = data.readUInt16BE(0);
        const header = data.subarray(2, 2 + headerLen).toString("utf8");
        if (header.includes("Path:audio")) chunks.push(data.subarray(2 + headerLen));
      } else {
        const msg = data.toString("utf8");
        if (msg.includes("Path:turn.end")) {
          clearTimeout(timer);
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(Buffer.concat(chunks));
        }
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.on("close", () => {
      clearTimeout(timer);
      if (chunks.length === 0) reject(new Error("edge-tts: no audio"));
    });
  });
}

export async function POST(request: Request) {
  try {
    const { text, voice } = await request.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const v = typeof voice === "string" && voice ? voice : DEFAULT_VOICE;
    const audio = await synthesize(text.slice(0, 5000), v);
    if (audio.length === 0) return NextResponse.json({ error: "no audio" }, { status: 502 });
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[api/tts] error:", e);
    return NextResponse.json({ error: "tts failed" }, { status: 502 });
  }
}
