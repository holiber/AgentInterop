import { ZodError } from "zod";

export type SerializedError = {
  name: string;
  message: string;
  issues?: unknown;
  stack?: string;
};

export function serializeError(err: unknown, opts?: { includeStack?: boolean }): SerializedError {
  const includeStack = opts?.includeStack ?? false;

  if (err instanceof ZodError) {
    return {
      name: "ZodError",
      message: err.message,
      issues: err.issues,
      ...(includeStack ? { stack: err.stack } : {})
    };
  }

  if (err instanceof Error) {
    return {
      name: err.name || "Error",
      message: err.message || String(err),
      ...(includeStack ? { stack: err.stack } : {})
    };
  }

  return {
    name: "Error",
    message: typeof err === "string" ? err : JSON.stringify(err)
  };
}

export type SseMessage = {
  /** Optional SSE event name. If omitted, defaults to a "message" event. */
  event?: string;
  /** Optional SSE event id. */
  id?: string;
  /** Optional SSE retry value (ms). */
  retry?: number;
  /** Message payload (will be split into multiple `data:` lines if it contains newlines). */
  data: string;
};

/**
 * Format a single SSE message. Uses LF (`\n`) newlines.
 *
 * Spec note: SSE frames are separated by a blank line.
 */
export function formatSseMessage(msg: SseMessage): string {
  let out = "";
  if (msg.id !== undefined) out += `id: ${msg.id}\n`;
  if (msg.event !== undefined) out += `event: ${msg.event}\n`;
  if (msg.retry !== undefined) out += `retry: ${msg.retry}\n`;

  const lines = msg.data.split("\n");
  for (const line of lines) out += `data: ${line}\n`;

  // Blank line terminates the event.
  out += "\n";
  return out;
}

const textEncoder = new TextEncoder();

export function encodeSseMessage(msg: SseMessage): Uint8Array {
  return textEncoder.encode(formatSseMessage(msg));
}

export type IterableToSseOptions<T> = {
  /**
   * Serialize each chunk into SSE `data:` payload.
   *
   * Default: JSON.stringify(value)
   */
  serialize?: (value: T) => string;
  /**
   * Event name for each chunk (or a resolver).
   *
   * Default: omitted (regular SSE message event).
   */
  event?: string | ((value: T, index: number) => string | undefined);
  /** Optional id resolver. */
  id?: string | ((value: T, index: number) => string | undefined);
  /** Optional retry to include on each message. */
  retry?: number;
  /**
   * Error handling behavior.
   * - "emit": emit an `event: error` frame with a serialized error and end the stream (default)
   * - "throw": rethrow the error and terminate iteration
   */
  onError?: "emit" | "throw";
  /** Event name used when `onError: "emit"`. Default: "error". */
  errorEvent?: string;
  /** Include error stack traces in the emitted error payload. Default: false. */
  includeErrorStack?: boolean;
};

/**
 * Convert an AsyncIterable stream to SSE byte chunks.
 *
 * This function is intentionally framework-agnostic: you can pipe the resulting
 * Uint8Array chunks into any HTTP response implementation.
 */
export async function* iterableToSse<T>(
  iter: AsyncIterable<T>,
  opts?: IterableToSseOptions<T>
): AsyncIterable<Uint8Array> {
  const serialize = opts?.serialize ?? ((v: T) => JSON.stringify(v));
  const onError = opts?.onError ?? "emit";
  const errorEvent = opts?.errorEvent ?? "error";

  let index = 0;
  try {
    for await (const value of iter) {
      const event =
        typeof opts?.event === "function"
          ? opts.event(value, index)
          : typeof opts?.event === "string"
            ? opts.event
            : undefined;
      const id =
        typeof opts?.id === "function" ? opts.id(value, index) : typeof opts?.id === "string" ? opts.id : undefined;

      yield encodeSseMessage({
        event,
        id,
        retry: opts?.retry,
        data: serialize(value)
      });
      index += 1;
    }
  } catch (err) {
    if (onError === "throw") throw err;
    yield encodeSseMessage({
      event: errorEvent,
      data: JSON.stringify({
        error: serializeError(err, { includeStack: opts?.includeErrorStack ?? false })
      })
    });
  }
}

