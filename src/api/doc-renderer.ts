import type { ApiSnapshot } from "./snapshot.js";

function groupId(id: string): string {
  const dot = id.indexOf(".");
  return dot === -1 ? id : id.slice(0, dot);
}

export function renderApiDocMarkdown(snapshot: ApiSnapshot): string {
  const projectName = "Agnet";

  const lines: string[] = [];
  lines.push(`# ${projectName} API Reference`);
  lines.push("");
  lines.push(`Version: **${snapshot.version}**`);
  lines.push("");
  lines.push("---");
  lines.push("");

  const endpoints = [...snapshot.endpoints].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, typeof endpoints>();
  for (const ep of endpoints) {
    const g = groupId(ep.id);
    const list = groups.get(g) ?? [];
    list.push(ep);
    groups.set(g, list);
  }

  const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const allEndpointIds = endpoints.map((e) => e.id);
  const lastEndpointId = allEndpointIds[allEndpointIds.length - 1];

  for (const g of groupNames) {
    lines.push(`## ${g}.*`);
    lines.push("");

    const eps = groups.get(g) ?? [];
    for (const ep of eps) {
      lines.push(`### \`${ep.id}\` (${ep.pattern})`);
      lines.push("");

      const blurb = ep.summary ?? ep.description;
      if (blurb) {
        lines.push(blurb.trim());
        lines.push("");
      }

      if (ep.args.length > 0) {
        lines.push("**Args**");
        for (const a of ep.args) {
          const req = a.required ? "required" : "optional";
          const desc = a.description?.trim();
          lines.push(
            `- \`${a.name}\` (${a.type}, ${req})${desc ? ` — ${desc}` : ""}`
          );
        }
        lines.push("");
      }

      if (ep.returns) {
        lines.push("**Returns**");
        const desc = ep.returns.description?.trim();
        lines.push(`- ${ep.returns.type}${desc ? ` — ${desc}` : ""}`);
        lines.push("");
      }

      if (ep.id !== lastEndpointId) {
        lines.push("---");
        lines.push("");
      }
    }
  }

  if (endpoints.length > 0) {
    lines.push("---");
    lines.push("");
  }

  lines.push("## Metadata");
  lines.push("");
  lines.push(`- Snapshot schema version: ${snapshot.version}`);
  lines.push(`- Profile: ${snapshot.profile}`);
  lines.push(`- Generated at: ${snapshot.generatedAt}`);
  lines.push("");
  lines.push("> Generated from runtime API snapshot. Do not edit manually.");
  lines.push("");

  return lines.join("\n");
}

