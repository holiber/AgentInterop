import type { ChatMessage } from "../protocol.js";
import { requireNonEmptyString, stripTrailingNewlineOnce } from "../internal/utils.js";
import { readChat } from "../storage/chats.js";
import { ChatsApi, type ChatsApiContext } from "./chats-api.js";

/**
 * CLI-facing sugar APIs.
 *
 * Philosophy:
 * - `ask`: human-style, returns text
 * - `prompt`: computer-style, returns structured JSON
 */
export class ShortcutsApi {
  private readonly chats: ChatsApi;

  constructor(private readonly ctx: ChatsApiContext) {
    this.chats = new ChatsApi(ctx);
  }

  async ask(
    prompt: string,
    providerId?: string
  ): Promise<string> {
    const content = requireNonEmptyString(prompt, "prompt");
    const chatId = await this.chats.create(providerId);

    try {
      let out = "";
      for await (const delta of this.chats.send(chatId, content)) out += typeof delta === "string" ? delta : "";
      return out;
    } finally {
      // One-shot by default: don't clutter disk with short-lived chats.
      try {
        await this.chats.close(chatId);
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  async prompt(
    prompt: string,
    providerId?: string
  ): Promise<{ text: string; chatId: string; providerId: string; history: ChatMessage[] }> {
    const content = requireNonEmptyString(prompt, "prompt");
    const chatId = await this.chats.create(providerId);

    try {
      let out = "";
      for await (const delta of this.chats.send(chatId, content)) out += typeof delta === "string" ? delta : "";
      const persisted = await readChat(this.ctx.cwd, chatId);
      return {
        text: stripTrailingNewlineOnce(out),
        chatId,
        providerId: persisted.providerId,
        history: Array.isArray(persisted.history) ? (persisted.history as ChatMessage[]) : []
      };
    } finally {
      try {
        await this.chats.close(chatId);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

