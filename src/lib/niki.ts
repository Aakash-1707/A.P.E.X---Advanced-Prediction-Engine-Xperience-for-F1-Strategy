import { supabase } from './supabase';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function getApiKey(): string {
  const key = import.meta.env.VITE_GROQ_API_KEY;
  if (!key) throw new Error("VITE_GROQ_API_KEY is missing from .env");
  return key;
}

const SYSTEM_INSTRUCTION = `You are N.I.K.I. (Natural Interface for Knowledge & Information), an advanced F1 AI strategy assistant for the A.P.E.X system. 
Your personality is inspired by the legendary Niki Lauda: you are brutally honest, highly pragmatic, deeply knowledgeable about racing, but fundamentally kind-hearted. You don't sugarcoat things, but you always want the user to succeed.

CRITICAL RULES:
1. You possess total knowledge of Formula 1, including the 2026 regulations, racing formats, tyre strategy, and telemetry analysis.
2. If the user asks about ANYTHING outside of Formula 1 or A.P.E.X, you must ruthlessly but politely refuse to answer. Say something like, "I'm a racing computer, not an encyclopedia. Let's get back to the track."
3. You have access to Supabase database tools to fetch current driver and constructor standings. Use these tools whenever the user asks for standings or points.
4. When explaining strategy, do it clearly and without fluff. Call it like it is.
5. Keep responses concise but informative. No unnecessary padding.`;

export type ChatMessage = { role: 'user' | 'model'; parts: { text: string }[] };

// Convert our internal chat format to OpenAI-compatible format used by Groq
function toGroqMessages(history: ChatMessage[], currentMessage: string) {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
  ];

  for (const msg of history) {
    messages.push({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts[0].text,
    });
  }

  messages.push({ role: 'user', content: currentMessage });
  return messages;
}

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'getDriverStandings',
      description: 'Fetch the current Formula 1 driver championship standings from the database.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getConstructorStandings',
      description: 'Fetch the current Formula 1 constructor championship standings from the database.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

async function getDriverStandings() {
  const { data, error } = await supabase.from('vw_driver_standings').select('*');
  if (error) throw new Error(error.message);
  return data;
}

async function getConstructorStandings() {
  const { data, error } = await supabase.from('vw_constructor_standings').select('*');
  if (error) throw new Error(error.message);
  return data;
}

async function callGroq(messages: { role: string; content: string }[], tools?: typeof TOOLS) {
  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 1024,
  };

  if (tools) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(`Groq API error ${res.status}: ${JSON.stringify(errorData)}`);
  }

  return res.json();
}

export async function askNiki(history: ChatMessage[], currentMessage: string, onUpdate?: (text: string) => void): Promise<string> {
  try {
    const messages = toGroqMessages(history, currentMessage);

    let data = await callGroq(messages, TOOLS);
    let choice = data.choices?.[0];

    // Handle tool calls (function calling loop)
    while (choice?.finish_reason === 'tool_calls' || choice?.message?.tool_calls?.length > 0) {
      if (onUpdate) onUpdate("N.I.K.I is querying the database...");

      const assistantMessage = choice.message;
      // Add the assistant's tool call message to the conversation
      messages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        let result;
        try {
          if (toolCall.function.name === 'getDriverStandings') {
            result = await getDriverStandings();
          } else if (toolCall.function.name === 'getConstructorStandings') {
            result = await getConstructorStandings();
          } else {
            result = { error: 'Unknown function' };
          }
        } catch (err: any) {
          result = { error: err.message };
        }

        // Add the tool response to the conversation
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        } as any);
      }

      if (onUpdate) onUpdate("N.I.K.I is analyzing the results...");

      // Send the tool results back to get the final response
      data = await callGroq(messages);
      choice = data.choices?.[0];
    }

    return choice?.message?.content || "I have no words.";

  } catch (err: any) {
    console.error("N.I.K.I Error:", err);

    if (err.message?.includes('429')) {
      return "I've hit the API rate limit. Please wait a moment and try again.";
    }

    return "My telemetry connection dropped. I can't process that right now. Check your API key and connection.";
  }
}
