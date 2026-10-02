import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { Files } from './db.js';

// The assistant creates downloadable files by wrapping them in these markers.
// This works with ANY AI provider (no provider-specific "tool calling" needed),
// and the server parses them out and turns them into real download links.
const SYSTEM_PROMPT = `You are a helpful AI assistant on a public website. You answer
questions and, when the user wants something as a file they can download, you output
the file using EXACTLY this format, each marker on its own line:

===FILE:the-filename.ext===
<the full file contents>
===ENDFILE===

Rules for files:
- Only use that format when a downloadable file genuinely makes sense (documents,
  code, CSV/spreadsheets, Markdown, HTML, JSON, etc.). For normal answers, just reply.
- Put the complete file contents between the markers. You may create more than one file.
- You cannot run code, browse the web, or access the internet — if asked, say so politely.
Keep replies concise and practical.`;

// Pulls any ===FILE:...=== blocks out of the model's text, saves them, and
// returns the cleaned reply plus the created files.
function extractFiles(userId, text) {
  const files = [];
  const re = /===FILE:(.+?)===\r?\n([\s\S]*?)\r?\n?===ENDFILE===/g;
  const cleaned = text.replace(re, (_m, rawName, content) => {
    const name = String(rawName).trim().replace(/[/\\]/g, '_') || 'file.txt';
    const id = randomUUID();
    Files.create(id, userId, name, content);
    files.push({ id, name });
    return `📄 Created **${name}** — download below.`;
  });
  return { reply: cleaned.trim(), files };
}

// ---- Provider: Google Gemini (free tier) via REST, no SDK needed ----
async function callGemini(contents) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(config.geminiModel)}:generateContent?key=${config.geminiApiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: contents.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

// ---- Provider: Groq (free, fast, OpenAI-compatible) via REST, no SDK ----
async function callGroq(contents) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      model: config.groqModel,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...contents.map((m) => ({ role: m.role, content: m.text })),
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

// ---- Provider: Anthropic Claude (paid) via SDK, loaded only if used ----
async function callAnthropic(contents) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: contents.map((m) => ({ role: m.role, content: m.text })),
  });
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

const PROVIDERS = {
  gemini: callGemini,
  groq: callGroq,
  anthropic: callAnthropic,
};

/**
 * Runs one assistant turn.
 * @param {number} userId
 * @param {Array<{role:'user'|'assistant', text:string}>} history
 * @param {string} userMessage
 * @param {string} [provider]  which AI provider to use (defaults to the free one)
 * @returns {Promise<{reply:string, files:Array<{id,name}>, newHistory:Array}>}
 */
export async function runAssistant(userId, history, userMessage, provider = config.freeProvider) {
  const contents = [...history, { role: 'user', text: userMessage }];

  const call = PROVIDERS[provider] || PROVIDERS.gemini;
  const rawText = await call(contents);

  const { reply, files } = extractFiles(userId, rawText);

  // Store the cleaned reply (not the huge file bodies) to keep context small.
  const newHistory = [...contents, { role: 'assistant', text: reply || '(file created)' }];

  return { reply, files, newHistory };
}

export { extractFiles }; // exported for tests
