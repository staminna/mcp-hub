import { describe, it, expect } from "vitest";
import { ClaudeDesktopAdapter } from "../../src/targets/claude-desktop.js";
import { getAdapter } from "../../src/targets/registry.js";
import { type McpServer } from "../../src/types.js";

const srv = (o: Partial<McpServer>): McpServer => ({
  id: "x", name: "x", transport: "stdio", tags: [], disabled: false, targets: "*", ...o,
});

describe("ClaudeDesktopAdapter (claude_desktop_config.json)", () => {
  const adapter = new ClaudeDesktopAdapter();

  it("points at the file Claude Desktop loads", () => {
    expect(getAdapter("claude-desktop").configPath).toMatch(/Library\/Application Support\/Claude\/claude_desktop_config\.json$/);
  });

  it("keeps Desktop's other settings and only replaces mcpServers", () => {
    const existing = JSON.stringify({ preferences: { sidebarMode: "chat" }, mcpServers: { old: { command: "node" } } });
    const out = JSON.parse(adapter.serialize(new Map([["new", { command: "npx" }]]), existing));
    expect(out.preferences).toEqual({ sidebarMode: "chat" });
    expect(out.mcpServers).toEqual({ new: { command: "npx" } });
  });

  it("writes stdio as-is, minus switches Desktop doesn't have", () => {
    expect(adapter.toSerializedServer(srv({ command: "node", args: ["a.js"], disabled: true, disabledTools: ["t"] })))
      .toEqual({ command: "node", args: ["a.js"] });
  });

  it("bridges remote servers through mcp-remote, and reads that back as the URL", () => {
    const http = srv({ id: "arkestra", transport: "streamable-http", url: "http://localhost:9315/mcp", env: { A: "1" } });
    const written = adapter.toSerializedServer(http);
    expect(written).toEqual({ command: "npx", args: ["-y", "mcp-remote", "http://localhost:9315/mcp"], env: { A: "1" } });
    expect(adapter.fromSerializedServer("arkestra", written)).toMatchObject({
      transport: "streamable-http", url: "http://localhost:9315/mcp", env: { A: "1" },
    });
    expect(adapter.fromSerializedServer("arkestra", written).command).toBeUndefined();
    expect(adapter.toSerializedServer(srv({ transport: "sse", url: "https://s/sse" })).args).toEqual(["-y", "mcp-remote", "https://s/sse"]);
    // A remote server without a URL has nothing to bridge
    expect(adapter.toSerializedServer(srv({ transport: "sse" }))).toEqual({});
  });

  it("leaves other npx servers alone", () => {
    for (const s of [
      { command: "npx", args: ["-y", "ssh-mcp", "--host=h"] },
      { command: "npx", args: ["-y", "mcp-remote"] },
      { command: "npx" },
      { command: "node", args: ["-y", "mcp-remote", "https://u"] },
    ]) {
      expect(adapter.fromSerializedServer("s", s)).toMatchObject({ transport: "stdio", command: s.command });
    }
  });
});
