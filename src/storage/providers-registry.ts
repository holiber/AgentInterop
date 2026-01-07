import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";

import type { AgentConfig } from "../providers.js";

export function providersRegistryPath(cwd: string): string {
  return path.join(cwd, ".cache", "agnet", "providers.json");
}

export async function readProvidersRegistry(
  cwd: string
): Promise<{ version: 1; providers: AgentConfig[] }> {
  try {
    const raw = await readFile(providersRegistryPath(cwd), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const providers = Array.isArray((parsed as { providers?: unknown }).providers)
      ? ((parsed as { providers: unknown[] }).providers as AgentConfig[])
      : [];
    return { version: 1, providers };
  } catch {
    return { version: 1, providers: [] };
  }
}

export function readProvidersRegistrySync(cwd: string): { version: 1; providers: AgentConfig[] } {
  try {
    const raw = readFileSync(providersRegistryPath(cwd), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const providers = Array.isArray((parsed as { providers?: unknown }).providers)
      ? ((parsed as { providers: unknown[] }).providers as AgentConfig[])
      : [];
    return { version: 1, providers };
  } catch {
    return { version: 1, providers: [] };
  }
}

export async function writeProvidersRegistry(cwd: string, providers: AgentConfig[]): Promise<void> {
  const p = providersRegistryPath(cwd);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ version: 1 as const, providers }, null, 2) + "\n", "utf-8");
}

export function writeProvidersRegistrySync(cwd: string, providers: AgentConfig[]): void {
  const p = providersRegistryPath(cwd);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ version: 1 as const, providers }, null, 2) + "\n", "utf-8");
}

