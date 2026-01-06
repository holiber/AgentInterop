#!/usr/bin/env node
/**
 * agentinterop
 *
 * Thin CLI wrapper for interacting with local AgentInterop agents over stdio.
 *
 * Notes:
 * - This file is intentionally plain ESM JavaScript so it can run in CI before `tsup` builds `dist/`.
 * - Transport framing: [uint32be byteLength][utf8 JSON bytes]
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { TextDecoder, TextEncoder } from "node:util";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function usage() {
  return `
AgentInterop CLI

Usage:
  agentinterop agents list [--json]
  agentinterop agents describe <agentId> [--json]
  agentinterop agents invoke --skill <skill> --prompt <text> [--agent <agentId>]
  agentinterop agents session open [--agent <agentId>] [--skill <skill>]
  agentinterop agents session send --session <sessionId> --prompt <text>
  agentinterop agents session close --session <sessionId>

Notes:
  - The built-in demo agent is "mock-agent".
  - Skills are currently informational; the mock agent supports a single chat-like interaction.
`.trim();
}

function parseArgs(argv) {
  const positional = [];
  /** @type {Record<string, string | boolean>} */
  const flags = {};

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      // Ignore passthrough for now (reserved).
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        const k = a.slice(2, eq);
        const v = a.slice(eq + 1);
        flags[k] = v;
      } else {
        const k = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          flags[k] = next;
          i++;
        } else {
          flags[k] = true;
        }
      }
      continue;
    }
    positional.push(a);
  }

  return { positional, flags };
}

function boolFlag(flags, name) {
  const v = flags[name];
  return v === true || v === "true" || v === "1";
}

function strFlag(flags, name) {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

function randomId(prefix) {
  const rand = Math.random().toString(16).slice(2, 10);
  return `${prefix}-${Date.now()}-${rand}`;
}

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
  /** @type {Uint8Array} */
  buffer = new Uint8Array(0);
  offset = 0;

  /**
   * @param {Uint8Array} chunk
   * @returns {unknown[]}
   */
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

    /** @type {unknown[]} */
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
      if (length > 100 * 1024 * 1024) throw new Error(`Frame too large: ${length} bytes`);
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

class StdioJsonTransport {
  decoder = new FrameDecoder();
  /** @type {unknown[]} */
  queue = [];
  /** @type {Array<(value: IteratorResult<unknown>) => void>} */
  waiters = [];
  ended = false;

  /**
   * @param {import("node:stream").Readable} readable
   * @param {import("node:stream").Writable} writable
   */
  constructor(readable, writable) {
    this.readable = readable;
    this.writable = writable;

    this.onDataBound = (chunk) => this.onData(chunk);
    this.onEndBound = () => this.onEnd();
    this.onErrorBound = () => this.onError();

    this.readable.on("data", this.onDataBound);
    this.readable.on("end", this.onEndBound);
    this.readable.on("error", this.onErrorBound);
  }

  /**
   * @param {unknown} message
   */
  async send(message) {
    if (this.ended) throw new Error("Transport is closed");

    const frame = encodeFrame(message);
    const ok = this.writable.write(frame);
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
          this.writable.off("drain", onDrain);
          this.writable.off("error", onError);
        };
        this.writable.on("drain", onDrain);
        this.writable.on("error", onError);
      });
    }
  }

  close() {
    if (this.ended) return;
    this.ended = true;

    this.readable.off("data", this.onDataBound);
    this.readable.off("end", this.onEndBound);
    this.readable.off("error", this.onErrorBound);

    while (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      resolve?.({ done: true, value: undefined });
    }
  }

  [Symbol.asyncIterator]() {
    return { next: () => this.next() };
  }

  next() {
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      return Promise.resolve({ done: false, value });
    }
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  onData(chunk) {
    try {
      const messages = this.decoder.push(
        new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      );
      for (const msg of messages) this.enqueue(msg);
    } catch {
      this.onError();
    }
  }

  onEnd() {
    this.close();
  }

  onError() {
    // Fail closed.
    this.close();
  }

  enqueue(message) {
    const waiter = this.waiters.shift();
    if (waiter) return waiter({ done: false, value: message });
    this.queue.push(message);
  }
}

function spawnLocalAgent({ command, args, cwd, env }) {
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    cwd,
    env
  });

  const transport = new StdioJsonTransport(child.stdout, child.stdin);

  const close = async () => {
    transport.close();
    if (!child.killed) child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
    });
  };

  return { child, transport, close };
}

async function nextMessage(iter, label) {
  const t = setTimeout(() => fail(`Timeout waiting for ${label}`, 2), 2000);
  // Avoid keeping the event loop alive on Node versions that support it.
  t.unref?.();
  const res = await iter.next();
  clearTimeout(t);
  if (res.done) fail(`Unexpected end of stream while waiting for ${label}`, 2);
  return res.value;
}

async function waitForType(iter, type) {
  while (true) {
    const msg = await nextMessage(iter, `message type "${type}"`);
    if (msg && typeof msg === "object" && msg.type === type) return msg;
  }
}

async function sendAndWaitComplete(iter, transport, sessionId, content, { onDelta } = {}) {
  await transport.send({ type: "session/send", sessionId, content });

  /** @type {Map<number, string>} */
  const deltasByIndex = new Map();
  while (true) {
    const msg = await nextMessage(iter, `stream/complete for session "${sessionId}"`);
    if (!msg || typeof msg !== "object") continue;
    if (msg.type === "session/stream" && msg.sessionId === sessionId) {
      const idx = typeof msg.index === "number" ? msg.index : deltasByIndex.size;
      const delta = typeof msg.delta === "string" ? msg.delta : "";
      deltasByIndex.set(idx, delta);
      onDelta?.(delta);
      continue;
    }
    if (msg.type === "session/complete" && msg.sessionId === sessionId) {
      const ordered = [...deltasByIndex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, d]) => d)
        .join("");
      return { msg, combined: ordered };
    }
  }
}

function getBuiltInAgents() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const mockAgentPath = path.join(here, "mock-agent.mjs");
  return [
    {
      id: "mock-agent",
      name: "Mock Agent",
      description: "Deterministic, stdio-driven mock agent for tests",
      command: process.execPath,
      args: [mockAgentPath]
    }
  ];
}

function resolveAgent(agentId) {
  const agents = getBuiltInAgents();
  const found = agents.find((a) => a.id === agentId);
  if (!found) fail(`Unknown agent: ${agentId}`);
  return found;
}

function sessionsDir() {
  return path.join(process.cwd(), ".cache", "agentinterop", "sessions");
}

function sessionPath(sessionId) {
  return path.join(sessionsDir(), `${sessionId}.json`);
}

async function readSession(sessionId) {
  try {
    const raw = await readFile(sessionPath(sessionId), "utf-8");
    return JSON.parse(raw);
  } catch {
    fail(`Session not found: ${sessionId}`);
  }
}

async function writeSession(sessionId, data) {
  await mkdir(sessionsDir(), { recursive: true });
  await writeFile(sessionPath(sessionId), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function cmdAgentsList(flags) {
  const agents = getBuiltInAgents().map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description
  }));
  // Default output is JSON for stable scripting and tests.
  if (!boolFlag(flags, "json") && flags.json !== undefined) {
    // `--json=false` is accepted but still prints JSON (reserved for future formats).
  }
  process.stdout.write(JSON.stringify({ agents }, null, 2) + "\n");
}

async function cmdAgentsDescribe(positional, flags) {
  const agentId = positional[2];
  if (!agentId) fail(`Missing <agentId>\n\n${usage()}`);

  const agent = resolveAgent(agentId);
  const description = {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    skills: [
      {
        id: "chat",
        description: "Chat-style interaction over session/start + session/send"
      }
    ]
  };
  // Default output is JSON for stable scripting and tests.
  if (!boolFlag(flags, "json") && flags.json !== undefined) {
    // `--json=false` is accepted but still prints JSON (reserved for future formats).
  }
  process.stdout.write(JSON.stringify({ agent: description }, null, 2) + "\n");
}

async function runOneShotChat({ agentId, prompt }) {
  const agent = resolveAgent(agentId);
  const sessionId = randomId("invoke");
  const conn = spawnLocalAgent({ command: agent.command, args: agent.args });
  try {
    const iter = conn.transport[Symbol.asyncIterator]();
    await waitForType(iter, "ready");
    await conn.transport.send({ type: "session/start", sessionId });
    await waitForType(iter, "session/started");

    const { combined } = await sendAndWaitComplete(iter, conn.transport, sessionId, prompt, {
      onDelta: (d) => process.stdout.write(d)
    });

    if (!combined.endsWith("\n")) process.stdout.write("\n");
  } finally {
    await conn.close();
  }
}

async function cmdAgentsInvoke(flags) {
  const agentId = strFlag(flags, "agent") ?? "mock-agent";
  const skill = strFlag(flags, "skill");
  const prompt = strFlag(flags, "prompt");

  if (!skill || !prompt) fail(`Missing --skill and/or --prompt\n\n${usage()}`);
  if (skill !== "chat") fail(`Unknown skill: ${skill}`);

  await runOneShotChat({ agentId, prompt });
}

async function cmdSessionOpen(flags) {
  const agentId = strFlag(flags, "agent") ?? "mock-agent";
  const skill = strFlag(flags, "skill") ?? "chat";
  if (skill !== "chat") fail(`Unknown skill: ${skill}`);

  const sessionId = randomId("session");
  await writeSession(sessionId, {
    version: 1,
    sessionId,
    agentId,
    skill,
    history: []
  });
  process.stdout.write(`${sessionId}\n`);
}

async function cmdSessionSend(flags) {
  const sessionId = strFlag(flags, "session");
  const prompt = strFlag(flags, "prompt");
  if (!sessionId || !prompt) fail(`Missing --session and/or --prompt\n\n${usage()}`);

  const sess = await readSession(sessionId);
  const agentId = sess.agentId ?? "mock-agent";
  const skill = sess.skill ?? "chat";
  if (skill !== "chat") fail(`Unknown skill: ${skill}`);

  const agent = resolveAgent(agentId);
  const conn = spawnLocalAgent({ command: agent.command, args: agent.args });
  try {
    const iter = conn.transport[Symbol.asyncIterator]();
    await waitForType(iter, "ready");
    await conn.transport.send({ type: "session/start", sessionId });
    await waitForType(iter, "session/started");

    // Replay prior user messages to reconstruct agent-side session state.
    const history = Array.isArray(sess.history) ? sess.history : [];
    const priorUsers = history.filter((m) => m && m.role === "user" && typeof m.content === "string");
    for (const m of priorUsers) {
      await sendAndWaitComplete(iter, conn.transport, sessionId, m.content);
    }

    const { msg } = await sendAndWaitComplete(iter, conn.transport, sessionId, prompt, {
      onDelta: (d) => process.stdout.write(d)
    });
    process.stdout.write("\n");

    await writeSession(sessionId, {
      version: 1,
      sessionId,
      agentId,
      skill,
      history: Array.isArray(msg.history) ? msg.history : history
    });
  } finally {
    await conn.close();
  }
}

async function cmdSessionClose(flags) {
  const sessionId = strFlag(flags, "session");
  if (!sessionId) fail(`Missing --session\n\n${usage()}`);
  await rm(sessionPath(sessionId), { force: true });
  process.stdout.write("ok\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv);

  if (boolFlag(flags, "help") || positional.length === 0) {
    process.stdout.write(usage() + "\n");
    return;
  }

  const [group, resource, action, subaction] = positional;

  if (group !== "agents") fail(usage());

  if (resource === "list") return cmdAgentsList(flags);
  if (resource === "describe") return cmdAgentsDescribe(positional, flags);
  if (resource === "invoke") return cmdAgentsInvoke(flags);

  if (resource === "session") {
    if (action === "open") return cmdSessionOpen(flags);
    if (action === "send") return cmdSessionSend(flags);
    if (action === "close") return cmdSessionClose(flags);
  }

  fail(usage());
}

await main();
