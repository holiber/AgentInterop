import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ChatMessage } from "../protocol.js";

export interface PersistedChatV1 {
  version: 1;
  chatId: string;
  providerId: string;
  history: ChatMessage[];
}

export function chatsDir(cwd: string): string {
  return path.join(cwd, ".cache", "agnet", "chats");
}

export function chatPath(cwd: string, chatId: string): string {
  return path.join(chatsDir(cwd), `${chatId}.json`);
}

export async function readChat(cwd: string, chatId: string): Promise<PersistedChatV1> {
  try {
    const raw = await readFile(chatPath(cwd, chatId), "utf-8");
    return JSON.parse(raw) as PersistedChatV1;
  } catch {
    throw new Error(`Chat not found: ${chatId}`);
  }
}

export async function writeChat(cwd: string, chatId: string, data: PersistedChatV1): Promise<void> {
  await mkdir(chatsDir(cwd), { recursive: true });
  await writeFile(chatPath(cwd, chatId), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function deleteChat(cwd: string, chatId: string): Promise<void> {
  await rm(chatPath(cwd, chatId), { force: true });
}

