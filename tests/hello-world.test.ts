import { describe, expect, it } from "vitest";

import { helloWorld } from "../src/index.js";

describe("helloWorld", () => {
  it("defaults to world", () => {
    expect(helloWorld()).toBe("Hello, world!");
  });

  it("greets a provided name", () => {
    expect(helloWorld("AgentInterop")).toBe("Hello, AgentInterop!");
  });

  it("trims whitespace", () => {
    expect(helloWorld("  world  ")).toBe("Hello, world!");
  });
});

