import type { ApiSnapshot, ApiSnapshotPattern } from "../api-snapshot.js";
import type { ApiSchemaNode } from "../workbench-light.js";

type CliArgType = "string" | "boolean" | "string[]";

export type SchemaArgMeta = {
  name: string;
  type: CliArgType;
  required?: boolean;
  description?: string;
  cli?: {
    flag?: `--${string}`;
    repeatable?: boolean;
    aliases?: Array<`--${string}`>;
    positionalIndex?: number;
  };
};

export type SchemaEndpointMeta = {
  id: string;
  pattern?: ApiSnapshotPattern;
  internal?: boolean;
  args?: SchemaArgMeta[];
};

export type FlattenedEndpoint = {
  id: string;
  pattern: ApiSnapshotPattern;
  internal?: boolean;
  args: SchemaArgMeta[];
  kind: "query" | "mutation" | "stream";
  callPath: string[];
};

function isLeafSchema(node: ApiSchemaNode): node is Extract<ApiSchemaNode, { kind: string }> {
  return !!node && typeof node === "object" && !Array.isArray(node) && "kind" in node;
}

export function flattenApiSchema(schema: ApiSchemaNode): FlattenedEndpoint[] {
  const out: FlattenedEndpoint[] = [];

  const walk = (node: ApiSchemaNode, callPath: string[]) => {
    if (isLeafSchema(node)) {
      const meta = (node as any).meta as SchemaEndpointMeta | undefined;
      if (!meta || typeof meta !== "object" || typeof meta.id !== "string") return;
      const id = meta.id;
      const pattern: ApiSnapshotPattern = meta.pattern ?? (node.kind === "stream" ? "serverStream" : "unary");
      const args = Array.isArray(meta.args) ? meta.args : [];
      const internal = meta.internal === true ? true : undefined;
      out.push({ id, pattern, internal, args, kind: node.kind as FlattenedEndpoint["kind"], callPath });
      return;
    }

    const obj = node as Record<string, ApiSchemaNode>;
    for (const k of Object.keys(obj)) {
      walk(obj[k], [...callPath, k]);
    }
  };

  walk(schema, []);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function isValidSourceDateEpoch(value: string | undefined): value is string {
  if (!value) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function deterministicGeneratedAt(): string {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (isValidSourceDateEpoch(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  return new Date(0).toISOString();
}

export function buildApiSnapshot(params: { schema: ApiSchemaNode; profile?: string }): ApiSnapshot {
  const endpoints = flattenApiSchema(params.schema)
    .filter((e) => !e.internal)
    .filter((e) => e.id !== "internal.apiDoc" && !e.id.startsWith("internal."))
    .map((e) => ({
      id: e.id,
      pattern: e.pattern,
      args: e.args.map((a) => ({
        name: a.name,
        type: a.type,
        required: a.required ?? false,
        description: a.description,
        cli:
          a.cli && (a.cli.flag || a.cli.repeatable || a.cli.aliases?.length || a.cli.positionalIndex !== undefined)
            ? {
                flag: a.cli.flag,
                repeatable: a.cli.repeatable,
                aliases: a.cli.aliases,
                positionalIndex: a.cli.positionalIndex
              }
            : undefined
      }))
    }));

  return {
    version: 1,
    generatedAt: deterministicGeneratedAt(),
    profile: params.profile ?? "default",
    endpoints
  };
}

