import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ChatMessage } from "../protocol.js";

export interface PersistedChatV1 {
  version: 1;
  chatId: string;
  providerId: string;
  history: ChatMessage[];
}

export type PersistedChatRef = {
  chatId: string;
  path: string;
  mtimeMs: number;
};

export function chatsDir(cwd: string): string {
  return path.join(cwd, ".cache", "agnet", "chats");
}

export function chatPath(cwd: string, chatId: string): string {
  return path.join(chatsDir(cwd), `${chatId}.json`);
}

export async function listChats(cwd: string): Promise<PersistedChatRef[]> {
  const dir = chatsDir(cwd);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const refs: PersistedChatRef[] = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith(".json")) continue;
      const chatId = ent.name.slice(0, -".json".length);
      const p = path.join(dir, ent.name);
      try {
        const s = await stat(p);
        refs.push({ chatId, path: p, mtimeMs: s.mtimeMs });
      } catch {
        // Ignore races (deleted between readdir/stat).
      }
    }
    refs.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return refs;
  } catch {
    return [];
  }
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

