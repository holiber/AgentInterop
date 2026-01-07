import { describe, expect, expectTypeOf, it } from "vitest";

import type { AgentEvent, Artifact, ChatEvent, ChatRef, Message, Part } from "../src/protocol.js";

describe("A2A core entities (Tier1)", () => {
  it("can model Chat -> Message -> Part and Artifact", () => {
    const now = new Date().toISOString();

    const chat = {
      id: "c1",
      providerId: "provider-1",
      status: "created",
      createdAt: now,
      execution: { location: "local", durability: "ephemeral" }
    } satisfies ChatRef;

    const parts = [{ kind: "text", text: "hello" }] satisfies Part[];

    const msg = {
      id: "m1",
      chatId: chat.id,
      role: "user",
      parts,
      timestamp: now
    } satisfies Message;

    const artifact = {
      id: "a1",
      chatId: chat.id,
      type: "text/plain",
      parts: [{ kind: "text", text: "result" }]
    } satisfies Artifact;

    expect(chat.status).toBe("created");
    expect(msg.chatId).toBe("c1");
    expect(msg.parts[0]).toEqual({ kind: "text", text: "hello" });
    expect(artifact.type).toBe("text/plain");
  });

  it("exposes a discriminated ChatEvent / AgentEvent union", () => {
    const now = new Date().toISOString();

    const e1 = { type: "chat.started", chatId: "c1", timestamp: now } satisfies ChatEvent;
    const e2 = {
      type: "message.delta",
      chatId: "c1",
      timestamp: now,
      messageId: "m1",
      delta: "hel",
      index: 0
    } satisfies ChatEvent;
    const e3 = {
      type: "chat.failed",
      chatId: "c1",
      timestamp: now,
      error: "boom"
    } satisfies ChatEvent;

    const asAgentEvent: AgentEvent = e1;
    expect(asAgentEvent.type).toBe("chat.started");

    const all: ChatEvent[] = [e1, e2, e3];
    for (const e of all) {
      if (e.type === "message.delta") {
        expectTypeOf(e.delta).toEqualTypeOf<string>();
        expect(e.delta.length).toBeGreaterThan(0);
      }
    }
  });
});

