import process from "node:process";
import readline from "node:readline/promises";

import type { ChatMessage } from "../protocol.js";
import { stripTrailingNewlineOnce, toErrorMessage } from "../internal/utils.js";
import { listChats, readChat } from "../storage/chats.js";
import { ChatsApi, type ChatsApiContext } from "../apis/chats-api.js";
import { ProvidersApi } from "../apis/providers-api.js";

export type TuiMode = "simple" | "advanced";

export type RunTuiOptions = {
  mode?: TuiMode;
  providerId?: string;
  chatId?: string;
};

type ChatSummary = {
  chatId: string;
  providerId: string;
  messages: number;
  lastLine?: string;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function shortId(id: string, max = 28): string {
  if (id.length <= max) return id;
  return id.slice(0, Math.max(0, max - 3)) + "...";
}

function oneLine(text: string, max = 80): string {
  const t = stripTrailingNewlineOnce(text).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 3)) + "...";
}

function printHelp(mode: TuiMode): void {
  const lines: string[] = [];
  lines.push("");
  lines.push("Commands:");
  lines.push("  /help               Show this help");
  lines.push("  /exit               Quit");
  if (mode === "advanced") {
    lines.push("  /list               List chats");
    lines.push("  /new                Create a new chat");
    lines.push("  /switch             Switch chat (interactive)");
    lines.push("  /chat <id>          Switch to chat by id");
    lines.push("  /delete <id>        Delete a chat (removes its local file)");
    lines.push("  /clear              Clear the screen");
  }
  lines.push("");
  process.stdout.write(lines.join("\n"));
}

function formatHistory(history: ChatMessage[]): string {
  const out: string[] = [];
  for (const m of history) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const prefix = m.role === "user" ? "you: " : "agent: ";
    out.push(prefix + stripTrailingNewlineOnce(m.content));
  }
  return out.length > 0 ? out.join("\n\n") + "\n\n" : "";
}

async function loadChatSummaries(cwd: string): Promise<ChatSummary[]> {
  const refs = await listChats(cwd);
  const summaries: ChatSummary[] = [];

  for (const ref of refs) {
    try {
      const chat = await readChat(cwd, ref.chatId);
      const history = Array.isArray(chat.history) ? (chat.history as ChatMessage[]) : [];
      const last = history.length > 0 ? history[history.length - 1] : undefined;
      const lastLine = last && typeof last.content === "string" ? oneLine(last.content) : undefined;
      summaries.push({
        chatId: chat.chatId,
        providerId: chat.providerId,
        messages: history.length,
        lastLine
      });
    } catch {
      // Ignore unreadable/invalid chat entries.
    }
  }

  return summaries;
}

function printChatList(list: ChatSummary[]): void {
  if (list.length === 0) {
    process.stdout.write("\nNo chats found in .cache/agnet/chats.\n");
    return;
  }

  process.stdout.write("\nChats:\n");
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const meta = `${shortId(c.chatId)}  (${c.providerId}, ${c.messages} msgs)`;
    const last = c.lastLine ? ` — ${c.lastLine}` : "";
    process.stdout.write(`  [${i + 1}] ${meta}${last}\n`);
  }
  process.stdout.write("\n");
}

async function pickChatInteractive(rl: readline.Interface, cwd: string): Promise<string | undefined> {
  const list = await loadChatSummaries(cwd);
  printChatList(list);

  if (list.length === 0) return undefined;

  const answer = (await rl.question("Select chat number (or blank to cancel): ")).trim();
  if (!answer) return undefined;
  const idx = Number(answer);
  if (!Number.isFinite(idx) || idx < 1 || idx > list.length) {
    process.stdout.write("Invalid selection.\n");
    return undefined;
  }
  return list[idx - 1].chatId;
}

async function ensureChat(opts: {
  chats: ChatsApi;
  providers: ProvidersApi;
  cwd: string;
  providerId?: string;
  chatId?: string;
}): Promise<{ chatId: string; providerId: string }> {
  if (isNonEmptyString(opts.chatId)) {
    const existing = await readChat(opts.cwd, opts.chatId);
    return { chatId: existing.chatId, providerId: existing.providerId };
  }
  const providerId = await opts.providers.resolveDefaultProviderId(opts.providerId);
  const chatId = await opts.chats.create(providerId);
  return { chatId, providerId };
}

async function runSimple(rl: readline.Interface, chats: ChatsApi, providers: ProvidersApi, ctx: ChatsApiContext, opts: RunTuiOptions): Promise<void> {
  const { chatId, providerId } = await ensureChat({
    chats,
    providers,
    cwd: ctx.cwd,
    providerId: opts.providerId,
    chatId: opts.chatId
  });

  process.stdout.write(`\nAgnet TUI (simple) — chat ${chatId} (provider: ${providerId})\n`);
  process.stdout.write('Type your message and press Enter. Use "/exit" to quit.\n');
  printHelp("simple");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const line = await rl.question("> ");
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "/exit" || trimmed === "/quit") break;
    if (trimmed === "/help") {
      printHelp("simple");
      continue;
    }

    process.stdout.write("\nagent: ");
    try {
      for await (const delta of chats.send(chatId, trimmed)) process.stdout.write(delta);
    } catch (err) {
      process.stdout.write(`\n[error] ${toErrorMessage(err)}\n`);
    }
    process.stdout.write("\n");
  }
}

async function runAdvanced(rl: readline.Interface, chats: ChatsApi, providers: ProvidersApi, ctx: ChatsApiContext, opts: RunTuiOptions): Promise<void> {
  process.stdout.write("\nAgnet TUI (advanced)\n");
  process.stdout.write('Commands: "/help", "/new", "/list", "/switch", "/chat <id>", "/delete <id>", "/exit"\n');
  printHelp("advanced");

  let current = await ensureChat({
    chats,
    providers,
    cwd: ctx.cwd,
    providerId: opts.providerId,
    chatId: opts.chatId
  });

  try {
    const existing = await readChat(ctx.cwd, current.chatId);
    const history = Array.isArray(existing.history) ? (existing.history as ChatMessage[]) : [];
    const rendered = formatHistory(history);
    if (rendered) {
      process.stdout.write(`\n--- chat ${current.chatId} (provider: ${current.providerId}) ---\n\n`);
      process.stdout.write(rendered);
    } else {
      process.stdout.write(`\n--- chat ${current.chatId} (provider: ${current.providerId}) ---\n`);
    }
  } catch {
    // best effort
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const prompt = `[${shortId(current.chatId, 18)}] > `;
    const line = await rl.question(prompt);
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "/exit" || trimmed === "/quit") break;
    if (trimmed === "/help") {
      printHelp("advanced");
      continue;
    }
    if (trimmed === "/clear") {
      process.stdout.write("\x1Bc");
      continue;
    }
    if (trimmed === "/list") {
      const list = await loadChatSummaries(ctx.cwd);
      printChatList(list);
      continue;
    }
    if (trimmed === "/switch") {
      const picked = await pickChatInteractive(rl, ctx.cwd);
      if (picked) {
        const chat = await readChat(ctx.cwd, picked);
        current = { chatId: chat.chatId, providerId: chat.providerId };
        process.stdout.write(`\nSwitched to chat ${current.chatId} (provider: ${current.providerId})\n`);
      }
      continue;
    }
    if (trimmed === "/new") {
      const providerId = await providers.resolveDefaultProviderId(opts.providerId);
      const chatId = await chats.create(providerId);
      current = { chatId, providerId };
      process.stdout.write(`\nCreated chat ${chatId} (provider: ${providerId})\n`);
      continue;
    }
    if (trimmed.startsWith("/chat ")) {
      const id = trimmed.slice("/chat ".length).trim();
      if (!id) {
        process.stdout.write("Usage: /chat <id>\n");
        continue;
      }
      try {
        const chat = await readChat(ctx.cwd, id);
        current = { chatId: chat.chatId, providerId: chat.providerId };
        process.stdout.write(`\nSwitched to chat ${current.chatId} (provider: ${current.providerId})\n`);
      } catch (err) {
        process.stdout.write(`[error] ${toErrorMessage(err)}\n`);
      }
      continue;
    }
    if (trimmed.startsWith("/delete ")) {
      const id = trimmed.slice("/delete ".length).trim();
      if (!id) {
        process.stdout.write("Usage: /delete <id>\n");
        continue;
      }
      try {
        await chats.close(id);
        process.stdout.write(`Deleted chat ${id}.\n`);
        if (current.chatId === id) {
          current = await ensureChat({ chats, providers, cwd: ctx.cwd, providerId: opts.providerId });
          process.stdout.write(`Switched to new chat ${current.chatId}.\n`);
        }
      } catch (err) {
        process.stdout.write(`[error] ${toErrorMessage(err)}\n`);
      }
      continue;
    }

    process.stdout.write("\nagent: ");
    try {
      for await (const delta of chats.send(current.chatId, trimmed)) process.stdout.write(delta);
    } catch (err) {
      process.stdout.write(`\n[error] ${toErrorMessage(err)}\n`);
    }
    process.stdout.write("\n");
  }
}

export async function runTui(ctx: ChatsApiContext, opts: RunTuiOptions = {}): Promise<"ok"> {
  const mode: TuiMode = opts.mode === "simple" || opts.mode === "advanced" ? opts.mode : "advanced";

  const chats = new ChatsApi(ctx);
  const providers = new ProvidersApi(ctx);

  if (!process.stdin.isTTY) throw new Error("TUI requires an interactive TTY (stdin is not a TTY)");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let interruptedOnce = false;
  const onSigInt = () => {
    if (interruptedOnce) {
      process.stdout.write("\n");
      process.exitCode = 130;
      rl.close();
      return;
    }
    interruptedOnce = true;
    process.stdout.write('\n(press Ctrl+C again or type "/exit" to quit)\n');
  };
  process.on("SIGINT", onSigInt);

  try {
    if (mode === "simple") await runSimple(rl, chats, providers, ctx, opts);
    else await runAdvanced(rl, chats, providers, ctx, opts);
    return "ok";
  } finally {
    process.off("SIGINT", onSigInt);
    rl.close();
  }
}

