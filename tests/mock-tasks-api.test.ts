import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import type {
  AgentToClientMessage,
  TaskEvent,
  TaskRef,
  TasksCancelResultMessage,
  TasksCreatedMessage,
  TasksGetResultMessage,
  TasksListResultMessage
} from "../src/protocol.js";
import { spawnLocalAgent } from "../src/local-runtime.js";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
      // Avoid keeping the event loop alive on Node versions that support it.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      (t as unknown as { unref?: () => void }).unref?.();
    })
  ]);
}

async function nextMessage(iter: AsyncIterator<unknown>, label: string): Promise<AgentToClientMessage> {
  const res = await withTimeout(iter.next(), 2000, label);
  if (res.done) throw new Error(`Unexpected end of stream while waiting for ${label}`);
  return res.value as AgentToClientMessage;
}

async function waitForType<T extends AgentToClientMessage["type"]>(
  iter: AsyncIterator<unknown>,
  type: T
): Promise<Extract<AgentToClientMessage, { type: T }>> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const msg = await nextMessage(iter, `message type ${type}`);
    if (msg.type === type) return msg as Extract<AgentToClientMessage, { type: T }>;
  }
}

function isTaskEvent(msg: AgentToClientMessage): msg is TaskEvent {
  return (
    !!msg &&
    typeof msg === "object" &&
    typeof (msg as { type?: unknown }).type === "string" &&
    (msg as { type: string }).type.startsWith("task.") ||
    (msg as { type: string }).type.startsWith("message.") ||
    (msg as { type: string }).type.startsWith("artifact.")
  );
}

describe("mock-agent Tasks API (stdio framed)", () => {
  it("streams task.started, multiple message.delta, then task.completed", async () => {
    const mockAgentPath = fileURLToPath(new URL("../bin/mock-agent.mjs", import.meta.url));
    const conn = spawnLocalAgent({
      command: process.execPath,
      args: [mockAgentPath, "--chunks=4", "--streaming=on"]
    });

    try {
      const iter = conn.transport[Symbol.asyncIterator]();
      await waitForType(iter, "ready");

      await conn.transport.send({
        type: "tasks/create",
        taskId: "t-stream",
        agentId: "mock-agent",
        title: "Stream task",
        prompt: "hello"
      });
      const created = (await waitForType(iter, "tasks/created")) as TasksCreatedMessage;
      expect(created.task.id).toBe("t-stream");
      expect(created.task.execution.location).toBe("local");
      expect(created.task.execution.durability).toBe("ephemeral");
      expect(created.task.execution.providerId).toBe("local");
      expect(created.task.execution.hint).toMatch(/runs locally/i);

      await conn.transport.send({ type: "tasks/subscribe", taskId: "t-stream" });

      let sawStarted = false;
      const deltas: Array<Extract<TaskEvent, { type: "message.delta" }>> = [];
      let completed: Extract<TaskEvent, { type: "task.completed" }> | undefined;

      while (!completed) {
        const msg = await nextMessage(iter, "task stream completion");
        if (!isTaskEvent(msg)) continue;
        if (msg.type === "task.started") sawStarted = true;
        if (msg.type === "message.delta") deltas.push(msg);
        if (msg.type === "task.completed") completed = msg;
      }

      expect(sawStarted).toBe(true);
      expect(deltas.length).toBeGreaterThan(1);
      const combined = deltas
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((d) => d.delta)
        .join("");
      expect(combined).toBe("MockTask response #1: hello");
      expect(completed.task.status).toBe("completed");
    } finally {
      await conn.close();
    }
  });

  it("supports list/get with stable ordering and cursor+limit paging", async () => {
    const mockAgentPath = fileURLToPath(new URL("../bin/mock-agent.mjs", import.meta.url));
    const conn = spawnLocalAgent({
      command: process.execPath,
      args: [mockAgentPath, "--chunks=3", "--streaming=on"]
    });

    try {
      const iter = conn.transport[Symbol.asyncIterator]();
      await waitForType(iter, "ready");

      await conn.transport.send({ type: "tasks/create", taskId: "t1", prompt: "one" });
      await waitForType(iter, "tasks/created");
      await conn.transport.send({ type: "tasks/create", taskId: "t2", prompt: "two" });
      await waitForType(iter, "tasks/created");

      await conn.transport.send({ type: "tasks/list", limit: "1" });
      const page1 = (await waitForType(iter, "tasks/listResult")) as TasksListResultMessage;
      expect(page1.tasks.map((t) => t.id)).toEqual(["t1"]);
      expect(page1.nextCursor).toBeDefined();

      await conn.transport.send({ type: "tasks/list", cursor: page1.nextCursor, limit: "10" });
      const page2 = (await waitForType(iter, "tasks/listResult")) as TasksListResultMessage;
      expect(page2.tasks.map((t) => t.id)).toEqual(["t2"]);
      expect(page2.nextCursor).toBeUndefined();

      await conn.transport.send({ type: "tasks/get", taskId: "t1" });
      const got1 = (await waitForType(iter, "tasks/getResult")) as TasksGetResultMessage;
      expect(got1.task).toMatchObject({ id: "t1", status: "created" } satisfies Partial<TaskRef>);

      await conn.transport.send({ type: "tasks/get", taskId: "t2" });
      const got2 = (await waitForType(iter, "tasks/getResult")) as TasksGetResultMessage;
      expect(got2.task).toMatchObject({ id: "t2", status: "created" } satisfies Partial<TaskRef>);
    } finally {
      await conn.close();
    }
  });

  it("supports cancel, reflected in get, and subscribe emits task.cancelled", async () => {
    const mockAgentPath = fileURLToPath(new URL("../bin/mock-agent.mjs", import.meta.url));
    const conn = spawnLocalAgent({
      command: process.execPath,
      args: [mockAgentPath, "--chunks=2", "--streaming=on"]
    });

    try {
      const iter = conn.transport[Symbol.asyncIterator]();
      await waitForType(iter, "ready");

      await conn.transport.send({ type: "tasks/create", taskId: "t-cancel", prompt: "x" });
      await waitForType(iter, "tasks/created");

      await conn.transport.send({ type: "tasks/cancel", taskId: "t-cancel" });
      const cancelledRes = (await waitForType(iter, "tasks/cancelResult")) as TasksCancelResultMessage;
      expect(cancelledRes.ok).toBe(true);

      await conn.transport.send({ type: "tasks/get", taskId: "t-cancel" });
      const got = (await waitForType(iter, "tasks/getResult")) as TasksGetResultMessage;
      expect(got.task.status).toBe("cancelled");

      await conn.transport.send({ type: "tasks/subscribe", taskId: "t-cancel" });
      let cancelledEvent: Extract<TaskEvent, { type: "task.cancelled" }> | undefined;
      while (!cancelledEvent) {
        const msg = await nextMessage(iter, "task.cancelled event");
        if (!isTaskEvent(msg)) continue;
        if (msg.type === "task.cancelled") cancelledEvent = msg;
      }
      expect(cancelledEvent.task.status).toBe("cancelled");
    } finally {
      await conn.close();
    }
  });
});

