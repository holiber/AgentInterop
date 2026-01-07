export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type ChatRole = "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * === A2A-aligned core entities (Tier1) ===
 *
 * Agnet aims to use the A2A (Agent2Agent) standard as the canonical internal model.
 * These types are transport-agnostic and JSON-serializable (suitable for CLI/IPC/HTTP/WS).
 *
 * Notes:
 * - A2A often represents timestamps as RFC3339/ISO-8601 strings. We model timestamps as
 *   ISO strings to keep payloads portable across transports and languages.
 * - Tier1 scope is types + minimal semantics only (no persistence, no remote APIs).
 */

/** RFC3339/ISO-8601 timestamp string (e.g. `new Date().toISOString()`). */
export type Timestamp = string;

export type ChatStatus = "created" | "running" | "completed" | "failed" | "cancelled" | "unknown";

export type ExecutionLocation = "local" | "remote" | "unknown";
export type Durability = "ephemeral" | "durable" | "unknown";

/**
 * Execution hints for UX and safety.
 * Not part of A2A core, but compatible as an extension.
 */
export interface ChatExecution {
  location: ExecutionLocation;
  durability: Durability;
  providerId?: string; // e.g. "cursor" | "openhands" | "local"
  hint?: string; // optional human-readable warning/help text
  _rawData?: unknown; // passthrough provider fields
}

export interface ChatRef {
  id: string;
  providerId: string;
  status: ChatStatus;

  title?: string; // "chat name" or derived summary (optional)
  createdAt?: Timestamp;
  updatedAt?: Timestamp;

  // Optional metadata commonly shown in UIs:
  repo?: { url?: string; ref?: string };
  pr?: { url?: string; number?: number };

  execution: ChatExecution;

  _rawData?: unknown; // provider payload passthrough
}

// ChatRef is the main Tier1 interaction container (chat-first).

export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * Message is a unit of interaction inside a Chat.
 * Messages form a chat history and are the basis for future trajectories.
 */
export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  parts: Part[];
  timestamp: Timestamp;
}

export type TextPart = { kind: "text"; text: string };
export type JsonPart = { kind: "json"; value: unknown }; // placeholder for structured content

/**
 * Part is a typed content container.
 *
 * Tier1 minimum:
 * - text: streaming-friendly text chunks
 * - json: placeholder for structured/multimodal content without breaking API
 */
export type Part = TextPart | JsonPart;

/**
 * Artifact is a produced result associated with a Chat (not a Message).
 *
 * - `type` is a MIME-like string (e.g. "text/plain", "application/json", "image/png").
 * - `metadata` is optional, JSON-serializable extra data.
 */
export interface Artifact {
  id: string;
  chatId: string;
  type: string;
  parts: Part[];
  metadata?: JsonObject;
}

interface ChatEventBase {
  chatId: string;
  timestamp: Timestamp;
}

/**
 * Streaming & lifecycle events aligned with A2A semantics.
 *
 * Minimum Tier1 events:
 * - chat.started
 * - message.delta (streaming text)
 * - message.completed
 * - artifact.created
 * - chat.completed
 * - chat.failed
 */
export type ChatEvent =
  | (ChatEventBase & { type: "chat.started" })
  | (ChatEventBase & {
      type: "message.delta";
      messageId: string;
      /** Streaming delta for a text part. */
      delta: string;
      /** Optional index for ordering deltas when needed. */
      index?: number;
    })
  | (ChatEventBase & { type: "message.completed"; message: Message })
  | (ChatEventBase & { type: "artifact.created"; artifact: Artifact })
  | (ChatEventBase & { type: "chat.completed"; chat: ChatRef })
  | (ChatEventBase & { type: "chat.cancelled"; chat: ChatRef })
  | (ChatEventBase & { type: "chat.failed"; error: string });

/**
 * AgentEvent is a unified event stream type.
 * For Tier1 it's equivalent to ChatEvent, but may expand in future tiers.
 */
export type AgentEvent = ChatEvent;

export interface ReadyMessage {
  type: "ready";
  pid: number;
  version: 1;
}

/**
 * @internal
 *
 * Legacy stdio protocol for the built-in mock agent and local CLI runtime.
 * This is not a user-facing "Session" abstraction; Tier1 public APIs are task-first.
 */
export interface SessionStartMessage {
  type: "session/start";
  sessionId?: string;
}

/** @internal */
export interface SessionStartedMessage {
  type: "session/started";
  sessionId: string;
}

/** @internal */
export interface SessionSendMessage {
  type: "session/send";
  sessionId: string;
  content: string;
}

/** @internal */
export interface SessionStreamMessage {
  type: "session/stream";
  sessionId: string;
  index: number;
  delta: string;
}

/** @internal */
export interface ToolCallPlaceholderMessage {
  type: "tool/call";
  sessionId: string;
  name: string;
  args: JsonObject;
}

/** @internal */
export interface SessionCompleteMessage {
  type: "session/complete";
  sessionId: string;
  message: ChatMessage;
  history: ChatMessage[];
}

export interface ChatsCreateMessage {
  type: "chats/create";
  chatId?: string;
  providerId?: string;
  title?: string;
  prompt?: string;
}

export interface ChatsCreatedMessage {
  type: "chats/created";
  chat: ChatRef;
}

export interface ChatsListMessage {
  type: "chats/list";
  providerId?: string;
  status?: ChatStatus;
  cursor?: string;
  limit?: string;
}

export interface ChatsListResultMessage {
  type: "chats/listResult";
  chats: ChatRef[];
  nextCursor?: string;
}

export interface ChatsGetMessage {
  type: "chats/get";
  chatId: string;
}

export interface ChatsGetResultMessage {
  type: "chats/getResult";
  chat: ChatRef;
}

export interface ChatsCancelMessage {
  type: "chats/cancel";
  chatId: string;
}

export interface ChatsCancelResultMessage {
  type: "chats/cancelResult";
  ok: true;
}

export interface ChatsSubscribeMessage {
  type: "chats/subscribe";
  chatId: string;
}

export interface ChatsErrorMessage {
  type: "chats/error";
  chatId?: string;
  error: string;
}

export type ClientToAgentMessage =
  | SessionStartMessage
  | SessionSendMessage
  | ChatsCreateMessage
  | ChatsListMessage
  | ChatsGetMessage
  | ChatsCancelMessage
  | ChatsSubscribeMessage;

export type AgentToClientMessage =
  | ReadyMessage
  | SessionStartedMessage
  | SessionStreamMessage
  | ToolCallPlaceholderMessage
  | SessionCompleteMessage
  | ChatsCreatedMessage
  | ChatsListResultMessage
  | ChatsGetResultMessage
  | ChatsCancelResultMessage
  | ChatsErrorMessage
  | ChatEvent;

