import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

import { createWorkbenchContext, module, query, stream } from "../src/workbench-light.js";

describe("workbench-light", () => {
  it("nested modules share ctx (activation cache per ctx)", async () => {
    const chats = module((ctx) => {
      ctx.onInit(() => {
        // side-effect should only run once per ctx
        ctx.events.sub("ping", () => {});
      });

      return {
        api: {
          health: query(z.undefined(), z.literal("ok"), async () => "ok" as const)
        }
      };
    });

    const root = module({ chats });

    const ctx = createWorkbenchContext();
    const a = root.activate(ctx);
    const b = root.activate(ctx);

    expect(a).toBe(b);
    expect(a.chats).toBe(b.chats);
    await expect(a.chats.health(undefined)).resolves.toBe("ok");
  });

  it("getApiSchema() does not run init callbacks (no event subscriptions)", () => {
    const m = module((ctx) => {
      ctx.onInit(() => {
        ctx.events.sub("ping", () => {});
      });
      return {
        api: {
          ok: query(z.undefined(), z.literal("ok"), () => "ok" as const)
        }
      };
    });

    // Should not throw and should not subscribe.
    const schema = m.getApiSchema() as any;
    expect(schema.ok.kind).toBe("query");

    // Activating runs init and subscribes.
    const ctx = createWorkbenchContext();
    expect(ctx._debug.eventSubCount()).toBe(0);
    m.activate(ctx);
    expect(ctx._debug.eventSubCount()).toBe(1);
  });

  it("stream validates chunks & completes", async () => {
    const collect = async <T,>(iter: AsyncIterable<T>): Promise<T[]> => {
      const out: T[] = [];
      for await (const x of iter) out.push(x);
      return out;
    };

    const api = module({
      send: stream(
        z.object({ prompt: z.string() }),
        z.object({ type: z.literal("token"), text: z.string() }),
        async function* ({ prompt }) {
          for (const t of prompt.split(/\s+/)) {
            yield { type: "token" as const, text: t };
          }
        }
      )
    }).activate();

    const chunks = await collect(api.send({ prompt: "hello world" }));
    expect(chunks.map((c) => c.text)).toEqual(["hello", "world"]);

    const bad = module({
      bad: stream(
        z.undefined(),
        z.object({ n: z.number().int() }),
        async function* () {
          yield { n: "nope" as any };
        }
      )
    }).activate();

    await expect(collect(bad.bad(undefined))).rejects.toBeInstanceOf(ZodError);
  });
});

