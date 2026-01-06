import { describe, expect, it } from "vitest";

// Test-only dependency (must remain a devDependency).
import OpenAI from "openai";

describe("OpenAI Responses API (streaming smoke)", () => {
  it.skipIf(!process.env.OPENAI_API_KEY)(
    "streams some output text",
    { timeout: 30_000 },
    async () => {
      const apiKey = process.env.OPENAI_API_KEY as string;
      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

      const client = new OpenAI({ apiKey });
      const stream = await client.responses.stream({
        model,
        input: "Reply with a short greeting (3-8 words)."
      });

      let text = "";
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          text += event.delta;
        }
      }

      expect(text.trim().length).toBeGreaterThan(0);
    },
  );
});

