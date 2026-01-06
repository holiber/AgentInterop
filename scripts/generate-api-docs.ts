import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { ApiHost } from "../src/api/api-host.js";
import { renderApiDocMarkdown } from "../src/api/doc-renderer.js";

async function main(): Promise<void> {
  const host = new ApiHost({ profile: "default" });
  const snapshot = await host.getApiSnapshot();

  const outDir = join(process.cwd(), "docs", "generated");
  await mkdir(outDir, { recursive: true });

  const jsonPath = join(outDir, "api.json");
  const mdPath = join(outDir, "api.md");

  await writeFile(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  await writeFile(mdPath, renderApiDocMarkdown(snapshot), "utf-8");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

