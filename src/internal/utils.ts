import type { AgentCard } from "../providers.js";

export function toErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  return String(err);
}

export function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${label}: expected non-empty string`);
  }
  return value;
}

export function stripTrailingNewlineOnce(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

export function isMarkedDefaultAgentCard(card: Pick<AgentCard, "extensions">): boolean {
  const ext = card.extensions as unknown;
  if (!ext || typeof ext !== "object" || Array.isArray(ext)) return false;
  const obj = ext as Record<string, unknown>;
  return obj.default === true || obj.isDefault === true;
}

