import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { Files } from './db.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

// The one tool we expose. Claude can WRITE files for the user to download,
// but it cannot run code or touch your server beyond this. That is the safe
// "chat + create files" design.
const TOOLS = [
  {
    name: 'create_file',
    description:
      'Create a text-based file for the user to download. Use for documents, ' +
      'code, CSV/spreadsheets, Markdown, HTML, JSON, etc. Provide the complete ' +
      'file contents. Do not use this for binary files or images.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'File name with extension, e.g. "report.md".' },
        content: { type: 'string', description: 'The full contents of the file.' },
      },
      required: ['filename', 'content'],
    },
  },
];

const SYSTEM_PROMPT = `You are a helpful AI assistant on a public website. You answer
questions and, when it helps, you CREATE FILES the user can download by calling the
create_file tool (documents, code, spreadsheets, etc.). Be concise and practical.
You cannot run code, browse the web, or access the internet — if asked, say so politely.`;

/**
 * Runs one assistant turn, following the tool loop until Claude is done.
 * @param {number} userId
 * @param {Array} history  prior messages in Anthropic format [{role, content}]
 * @param {string} userMessage  the new user message text
 * @returns {Promise<{reply: string, files: Array<{id,name}>, newHistory: Array}>}
 */
export async function runAssistant(userId, history, userMessage) {
  const messages = [...history, { role: 'user', content: userMessage }];
  const createdFiles = [];
  let replyText = '';

  // Guard against pathological loops; a handful of tool calls is plenty here.
  for (let step = 0; step < 8; step++) {
    const response = await client.messages.create({
      model: config.claudeModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Collect any assistant text in this step.
    for (const block of response.content) {
      if (block.type === 'text') replyText += block.text;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') break;

    // Execute every tool call Claude made, then feed results back.
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === 'create_file') {
        const id = randomUUID();
        const name = String(block.input.filename || 'file.txt').replace(/[/\\]/g, '_');
        const content = String(block.input.content ?? '');
        Files.create(id, userId, name, content);
        createdFiles.push({ id, name });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `File "${name}" created and is ready for the user to download.`,
        });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Unknown tool.',
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { reply: replyText.trim(), files: createdFiles, newHistory: messages };
}
