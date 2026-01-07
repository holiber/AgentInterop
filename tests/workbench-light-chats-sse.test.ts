import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import process from "node:process";

import { describe, expect, it } from "vitest";

import { chats } from "../src/modules/chats.js";
import { createWorkbenchContext } from "../src/workbench-light.js";
import { iterableToSse } from "../src/workbench-lite-sse.js";

const decodeAll = async (iter: AsyncIterable<Uint8Array>): Promise<string> => {
  const dec = new TextDecoder();
  let out = "";
  for await (const chunk of iter) out += dec.decode(chunk, { stream: true });
  out += dec.decode();
  return out;
};

describe("workbench-light chats.send over SSE", () => {
  it("streams deltas and formats as SSE frames", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "agnet-wb-chats-"));
    const mockAgentPath = path.join(process.cwd(), "bin", "mock-agent.mjs");

    const ctx = Object.assign(createWorkbenchContext(), {
      cwd,
      env: process.env,
      mockAgentPath
    });

    const api = chats.activate(ctx);
    const chatId = await api.create({});

    const sse = iterableToSse(api.send({ chatId, prompt: "hello" }), {
      event: "delta",
      serialize: (s) => s
    });

    const out = await decodeAll(sse);
    expect(out).toContain("event: delta\n");

    // The mock agent intentionally splits responses into multiple deltas.
    // Reconstruct the combined assistant text from SSE frames.
    const frames = out
      .split("\n\n")
      .map((s) => s.trimEnd())
      .filter((s) => s.length > 0);

    const deltaPayloads = frames
      .map((frame) => {
        const lines = frame.split("\n");
        const event = lines.find((l) => l.startsWith("event: "))?.slice("event: ".length);
        const dataLines = lines
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice("data: ".length));
        return { event, data: dataLines.join("\n") };
      })
      .filter((f) => f.event === "delta")
      .map((f) => f.data);

    const combined = deltaPayloads.join("");
    expect(combined).toContain("MockAgent response #1: hello");
    // Frames are separated by blank lines.
    expect(out).toMatch(/\n\n$/);
  });
});

