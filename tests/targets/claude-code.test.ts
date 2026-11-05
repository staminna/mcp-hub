import { describe, it, expect } from "vitest";
import { ClaudeCodeAdapter } from "../../src/targets/claude-code.js";
import { type McpServer } from "../../src/types.js";

const srv = (o: Partial<McpServer>): McpServer => ({
  id: "x", name: "x", transport: "stdio", tags: [], disabled: false, targets: "*", ...o,
});

describe("ClaudeCodeAdapter (~/.claude.json)", () => {
  const adapter = new ClaudeCodeAdapter();

  it("replaces only mcpServers and keeps all other state", () => {
    const existing = JSON.stringify({
      numStartups: 42,
      projects: { "/a": { history: [1, 2] } },
      mcpServers: { old: { command: "node" } },
    });
    const out = JSON.parse(adapter.serialize(new Map([["new", { command: "npx" }]]), existing));
    expect(out.numStartups).toBe(42);
    expect(out.projects).toEqual({ "/a": { history: [1, 2] } });
    expect(out.mcpServers).toEqual({ new: { command: "npx" } });
  });

  it("refuses to write over a file it can't parse", () => {
    expect(() => adapter.serialize(new Map(), "{ not json")).toThrow();
  });

  it("adds type for remote servers and drops unsupported keys", () => {
    expect(adapter.toSerializedServer(srv({ transport: "streamable-http", url: "https://u" })))
      .toEqual({ type: "http", url: "https://u" });
    expect(adapter.toSerializedServer(srv({ transport: "sse", url: "https://u" })).type).toBe("sse");
    expect(adapter.toSerializedServer(srv({ command: "npx", disabledTools: ["a"] })))
      .toEqual({ command: "npx" });
  });

  it("reads type: sse back as sse transport", () => {
    expect(adapter.fromSerializedServer("r", { type: "sse", url: "https://u" }).transport).toBe("sse");
  });
});
