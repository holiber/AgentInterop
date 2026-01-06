import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./.cache/playwright",
  use: {
    headless: true,
    viewport: { width: 800, height: 400 }
  }
});

