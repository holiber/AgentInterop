import { describe, expect, it } from "vitest";
import { z } from "zod";

import { formatSseMessage, iterableToSse } from "../src/workbench-lite-sse.js";

const decodeAll = async (iter: AsyncIterable<Uint8Array>): Promise<string> => {
  const dec = new TextDecoder();
  let out = "";
  for await (const chunk of iter) out += dec.decode(chunk, { stream: true });
  out += dec.decode();
  return out;
};

describe("workbench-lite-sse", () => {
  it("formats SSE messages (multiline data)", () => {
    const msg = formatSseMessage({ data: "a\nb" });
    expect(msg).toBe("data: a\ndata: b\n\n");
  });

  it("converts async iterable chunks into SSE frames", async () => {
    async function* gen() {
      yield { x: 1 };
      yield { x: 2 };
    }

    const out = await decodeAll(iterableToSse(gen()));
    expect(out).toBe('data: {"x":1}\n\ndata: {"x":2}\n\n');
  });

  it("emits an error frame (including Zod issues) and ends the stream", async () => {
    async function* gen() {
      yield { ok: true };
      // Force a ZodError
      z.object({ n: z.number().int() }).parse({ n: "nope" });
      yield { ok: false };
    }

    const out = await decodeAll(iterableToSse(gen()));
    expect(out).toContain('data: {"ok":true}\n\n');
    expect(out).toContain("event: error\n");
    expect(out).toContain('"name":"ZodError"');
    expect(out).toContain('"issues"');
    expect(out).toMatch(/\n\n$/);
  });
});

