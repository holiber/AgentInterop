#!/usr/bin/env node
/**
 * mock-agent
 *
 * A deterministic, stdio-driven mock agent that speaks length-prefixed JSON.
 *
 * Frame format: [uint32be byteLength][utf8 JSON bytes]
 */

import process from "node:process";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });

function encodeFrame(message) {
  const json = JSON.stringify(message);
  const body = textEncoder.encode(json);

  const header = new Uint8Array(4);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  view.setUint32(0, body.byteLength, false);

  const frame = new Uint8Array(4 + body.byteLength);
  frame.set(header, 0);
  frame.set(body, 4);
  return frame;
}

class FrameDecoder {
  buffer = new Uint8Array(0);
  offset = 0;

  push(chunk) {
    if (!chunk || chunk.byteLength === 0) return [];

    if (this.offset > 0) {
      this.buffer = this.buffer.slice(this.offset);
      this.offset = 0;
    }

    const next = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
    next.set(this.buffer, 0);
    next.set(chunk, this.buffer.byteLength);
    this.buffer = next;

    const out = [];
    while (true) {
      const remaining = this.buffer.byteLength - this.offset;
      if (remaining < 4) break;

      const view = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset + this.offset,
        4
      );
      const length = view.getUint32(0, false);
      if (remaining < 4 + length) break;

      const start = this.offset + 4;
      const end = start + length;
      const payload = this.buffer.slice(start, end);
      this.offset = end;

      const json = textDecoder.decode(payload);
      out.push(JSON.parse(json));
    }

    if (this.offset === this.buffer.byteLength) {
      this.buffer = new Uint8Array(0);
      this.offset = 0;
    }

    return out;
  }
}

function parseArgs(argv) {
  const out = {
    chunks: 5,
    emitToolCalls: false,
    streaming: true
  };

  // Optional env override for tests/CI:
  // - "1" | "true" | "on"  => streaming enabled
  // - "0" | "false" | "off" => streaming disabled
  const envStreaming = process.env.AGENTINTEROP_STREAMING;
  if (typeof envStreaming === "string" && envStreaming.trim().length > 0) {
    const v = envStreaming.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "on") out.streaming = true;
    else if (v === "0" || v === "false" || v === "off") out.streaming = false;
  }

  for (const arg of argv.slice(2)) {
    if (arg === "--emitToolCalls") out.emitToolCalls = true;
    if (arg.startsWith("--streaming=")) {
      const v = arg.slice("--streaming=".length).trim().toLowerCase();
      if (v === "on") out.streaming = true;
      if (v === "off") out.streaming = false;
    }
    if (arg.startsWith("--chunks=")) {
      const n = Number(arg.slice("--chunks=".length));
      if (Number.isFinite(n) && n >= 1) out.chunks = Math.floor(n);
    }
  }
  return out;
}

function chunkString(text, parts) {
  if (parts <= 1) return [text];
  const size = Math.ceil(text.length / parts);
  const chunks = [];
  for (let i = 0; i < parts; i++) {
    const start = i * size;
    const end = Math.min(text.length, (i + 1) * size);
    if (start >= text.length) break;
    chunks.push(text.slice(start, end));
  }
  return chunks.length > 0 ? chunks : [""];
}

async function writeMessage(msg) {
  const frame = encodeFrame(msg);
  const ok = process.stdout.write(frame);
  if (!ok) {
    await new Promise((resolve, reject) => {
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        process.stdout.off("drain", onDrain);
        process.stdout.off("error", onError);
      };
      process.stdout.on("drain", onDrain);
      process.stdout.on("error", onError);
    });
  }
}

const config = parseArgs(process.argv);
const decoder = new FrameDecoder();

const sessions = new Map(); // sessionId -> { history: Array<{role, content}>, turns: number }
let sessionCounter = 0;

const tasks = new Map(); // taskId -> { task, prompt, messageId, turns, cancelled }
const taskOrder = []; // stable creation order
let taskCounter = 0;

function getOrCreateSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const created = { history: [], turns: 0 };
  sessions.set(sessionId, created);
  return created;
}

function nowIso() {
  return new Date().toISOString();
}

function makeTaskRef({ taskId, agentId, title }) {
  const ts = nowIso();
  return {
    id: taskId,
    agentId: agentId || "mock-agent",
    status: "created",
    title: title || `Mock Task ${taskId}`,
    createdAt: ts,
    updatedAt: ts,
    execution: {
      location: "local",
      durability: "ephemeral",
      providerId: "local",
      hint: "This task runs locally and may stop if the process exits."
    },
    _rawData: { mock: true, kind: "task" }
  };
}

await writeMessage({ type: "ready", pid: process.pid, version: 1 });

async function handleChunk(chunk) {
  const messages = decoder.push(
    new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  );

  for (const msg of messages) {
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") continue;

    if (msg.type === "tasks/create") {
      const requestedId = typeof msg.taskId === "string" ? msg.taskId : undefined;
      const taskId = requestedId || `task-${++taskCounter}`;
      const agentId = typeof msg.agentId === "string" ? msg.agentId : "mock-agent";
      const title = typeof msg.title === "string" ? msg.title : undefined;
      const prompt = typeof msg.prompt === "string" ? msg.prompt : "";

      if (!tasks.has(taskId)) {
        const task = makeTaskRef({ taskId, agentId, title });
        tasks.set(taskId, {
          task,
          prompt,
          turns: 0,
          cancelled: false,
          messageId: `msg-${taskId}-1`
        });
        taskOrder.push(taskId);
      } else {
        const existing = tasks.get(taskId);
        if (existing && typeof prompt === "string" && prompt.length > 0) existing.prompt = prompt;
      }

      await writeMessage({ type: "tasks/created", task: tasks.get(taskId).task });
      continue;
    }

    if (msg.type === "tasks/list") {
      const providerId = typeof msg.providerId === "string" ? msg.providerId : undefined;
      const status = typeof msg.status === "string" ? msg.status : undefined;
      const cursorRaw = typeof msg.cursor === "string" ? msg.cursor : undefined;
      const limitRaw = typeof msg.limit === "string" ? msg.limit : undefined;

      // This mock agent only supports local tasks.
      if (providerId && providerId !== "local") {
        await writeMessage({ type: "tasks/listResult", tasks: [], nextCursor: undefined });
        continue;
      }

      let offset = 0;
      if (cursorRaw && cursorRaw.trim().length > 0) {
        const n = Number(cursorRaw);
        if (Number.isFinite(n) && n >= 0) offset = Math.floor(n);
      }

      let limit = 50;
      if (limitRaw && limitRaw.trim().length > 0) {
        const n = Number(limitRaw);
        if (Number.isFinite(n) && n >= 1) limit = Math.floor(n);
      }

      const all = taskOrder
        .map((id) => tasks.get(id))
        .filter(Boolean)
        .map((t) => t.task);

      const filtered = status ? all.filter((t) => t.status === status) : all;
      const page = filtered.slice(offset, offset + limit);
      const nextCursor = offset + limit < filtered.length ? String(offset + limit) : undefined;
      await writeMessage({ type: "tasks/listResult", tasks: page, nextCursor });
      continue;
    }

    if (msg.type === "tasks/get") {
      const taskId = typeof msg.taskId === "string" ? msg.taskId : "";
      const found = tasks.get(taskId);
      if (!found) {
        await writeMessage({ type: "tasks/error", taskId, error: `Unknown task: ${taskId}` });
        continue;
      }
      await writeMessage({ type: "tasks/getResult", task: found.task });
      continue;
    }

    if (msg.type === "tasks/cancel") {
      const taskId = typeof msg.taskId === "string" ? msg.taskId : "";
      const found = tasks.get(taskId);
      if (!found) {
        await writeMessage({ type: "tasks/error", taskId, error: `Unknown task: ${taskId}` });
        continue;
      }
      found.cancelled = true;
      found.task.status = "cancelled";
      found.task.updatedAt = nowIso();
      await writeMessage({ type: "tasks/cancelResult", ok: true });
      continue;
    }

    if (msg.type === "tasks/subscribe") {
      const taskId = typeof msg.taskId === "string" ? msg.taskId : "";
      const found = tasks.get(taskId);
      if (!found) {
        await writeMessage({ type: "tasks/error", taskId, error: `Unknown task: ${taskId}` });
        continue;
      }

      const timestamp = nowIso();
      if (found.task.status === "cancelled" || found.cancelled) {
        await writeMessage({
          type: "task.cancelled",
          taskId,
          timestamp,
          task: found.task
        });
        continue;
      }

      found.turns += 1;
      found.task.status = "running";
      found.task.updatedAt = nowIso();
      await writeMessage({ type: "task.started", taskId, timestamp: nowIso() });

      const assistantContent = `MockTask response #${found.turns}: ${found.prompt || ""}`.trimEnd();
      const deltas = chunkString(assistantContent, config.chunks);
      const messageId = `msg-${taskId}-${found.turns}`;

      for (let i = 0; i < deltas.length; i++) {
        if (found.task.status === "cancelled" || found.cancelled) {
          await writeMessage({
            type: "task.cancelled",
            taskId,
            timestamp: nowIso(),
            task: found.task
          });
          break;
        }
        await writeMessage({
          type: "message.delta",
          taskId,
          timestamp: nowIso(),
          messageId,
          index: i,
          delta: deltas[i]
        });
        await Promise.resolve();
      }

      if (found.task.status === "cancelled" || found.cancelled) continue;

      found.task.status = "completed";
      found.task.updatedAt = nowIso();
      await writeMessage({
        type: "task.completed",
        taskId,
        timestamp: nowIso(),
        task: found.task
      });
      continue;
    }

    if (msg.type === "session/start") {
      const requested = typeof msg.sessionId === "string" ? msg.sessionId : undefined;
      const sessionId = requested ?? `session-${++sessionCounter}`;
      getOrCreateSession(sessionId);
      await writeMessage({ type: "session/started", sessionId });
      continue;
    }

    if (msg.type === "session/send") {
      const sessionId =
        typeof msg.sessionId === "string" ? msg.sessionId : `session-${++sessionCounter}`;
      const content = typeof msg.content === "string" ? msg.content : "";
      const session = getOrCreateSession(sessionId);

      session.history.push({ role: "user", content });
      session.turns += 1;

      const assistantContent = `MockAgent response #${session.turns}: ${content}`;
      const deltas = chunkString(assistantContent, config.chunks);

      // Deterministic mode toggle:
      // - streaming enabled: emits session/stream deltas, then session/complete
      // - streaming disabled: emits only one session/complete (no deltas, no tool calls)
      if (config.streaming && config.emitToolCalls) {
        await writeMessage({
          type: "tool/call",
          sessionId,
          name: "mock.tool",
          args: { turn: session.turns, inputLength: content.length }
        });
      }

      if (config.streaming) {
        for (let i = 0; i < deltas.length; i++) {
          await writeMessage({
            type: "session/stream",
            sessionId,
            index: i,
            delta: deltas[i]
          });
          // Deterministic async boundary without timers.
          await Promise.resolve();
        }
      }

      const assistantMessage = { role: "assistant", content: assistantContent };
      session.history.push(assistantMessage);
      await writeMessage({
        type: "session/complete",
        sessionId,
        message: assistantMessage,
        history: session.history.slice()
      });
    }
  }
}

let processing = Promise.resolve();
process.stdin.on("data", (chunk) => {
  processing = processing.then(() => handleChunk(chunk)).catch(() => {});
});

process.stdin.on("end", () => {
  process.exit(0);
});

