import { describe, expect, it, vi } from "vitest";

let lastRequest: any = undefined;

vi.mock("openai", () => {
  class MockOpenAI {
    responses = {
      stream: async (req: any) => {
        lastRequest = req;
        return (async function* () {
          yield { type: "response.output_text.delta", delta: "Hello" };
          yield { type: "response.output_text.delta", delta: " world" };
          // Non-text event should be ignored by adapter.
          yield { type: "response.completed" };
        })();
      }
    };

    constructor(_opts: any) {}
  }

  return { default: MockOpenAI };
});

import { streamOpenAIResponseText } from "../src/adapters/openai.js";

describe("OpenAI adapter (Responses API)", () => {
  it("streams output_text deltas and composes input from history + prompt", async () => {
    lastRequest = undefined;

    const deltas: string[] = [];
    for await (const d of streamOpenAIResponseText({
      config: { apiKey: "k", model: "gpt-4o-mini", systemPrompt: "Be brief." },
      history: [
        { role: "user", content: "Prior user" },
        { role: "assistant", content: "Prior assistant" }
      ],
      prompt: "Next user"
    })) {
      deltas.push(d);
    }

    expect(deltas).toEqual(["Hello", " world"]);
    expect(lastRequest?.model).toBe("gpt-4o-mini");
    expect(String(lastRequest?.input)).toContain("System:\nBe brief.");
    expect(String(lastRequest?.input)).toContain("User:\nPrior user");
    expect(String(lastRequest?.input)).toContain("Assistant:\nPrior assistant");
    expect(String(lastRequest?.input)).toContain("User:\nNext user");
  });

  it("throws a clear error if apiKey is missing", async () => {
    const iter = streamOpenAIResponseText({
      config: { model: "gpt-4o-mini" },
      history: [],
      prompt: "hi"
    });
    await expect(iter[Symbol.asyncIterator]().next()).rejects.toThrow(/apiKey/i);
  });
});

