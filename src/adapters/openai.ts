import OpenAI from "openai";

import type { ChatMessage } from "../protocol.js";

export type OpenAIAdapterConfig = {
  baseUrl?: string;
  apiKey?: string;
  model: string;
  systemPrompt?: string;
};

function messagesToInput(params: { systemPrompt?: string; history: ChatMessage[]; prompt: string }): string {
  // Tier1 storage only preserves user/assistant roles; Responses API accepts free-form input.
  // Keep it simple + deterministic (future tiers can switch to structured input arrays).
  const parts: string[] = [];
  if (params.systemPrompt && params.systemPrompt.trim().length > 0) {
    parts.push(`System:\n${params.systemPrompt.trim()}`);
  }
  for (const m of params.history) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const label = m.role === "user" ? "User" : "Assistant";
    parts.push(`${label}:\n${m.content}`);
  }
  parts.push(`User:\n${params.prompt}`);
  return parts.join("\n\n");
}

/**
 * Streams output text from the OpenAI Responses API.
 *
 * This is an adapter-level primitive used by both the CLI Chats API and the programmatic Agnet API.
 */
export async function* streamOpenAIResponseText(params: {
  config: OpenAIAdapterConfig;
  history: ChatMessage[];
  prompt: string;
}): AsyncIterable<string> {
  const apiKey = params.config.apiKey;
  const model = params.config.model;
  if (!apiKey || apiKey.trim().length === 0) throw new Error("Missing OpenAI apiKey");
  if (!model || model.trim().length === 0) throw new Error("Missing OpenAI model");

  const client = new OpenAI({
    apiKey,
    ...(params.config.baseUrl ? { baseURL: params.config.baseUrl } : {})
  });

  const input = messagesToInput({
    systemPrompt: params.config.systemPrompt,
    history: params.history,
    prompt: params.prompt
  });

  const stream = await client.responses.stream({
    model,
    input
  });

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield event.delta;
    }
  }
}

