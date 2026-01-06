import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { helloWorld } from "../src/index.js";

test("hello-world page renders and screenshot is saved", async ({ page }) => {
  const message = helloWorld("world");

  await page.setContent(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>AgentInterop e2e</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; }
      #msg { font-size: 32px; }
    </style>
  </head>
  <body>
    <div id="msg"></div>
    <script>
      document.getElementById('msg').textContent = ${JSON.stringify(message)};
    </script>
  </body>
</html>`
  );

  await expect(page.locator("#msg")).toHaveText("Hello, world!");

  const screenshotsDir = path.join(process.cwd(), "e2e", "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotsDir, "hello-world.png"),
    fullPage: true
  });
});

