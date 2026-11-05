import { describe, it, expect } from "vitest";
import { ClaudeMcpAdapter } from "../../src/targets/claude-mcp.js";

describe("ClaudeMcpAdapter", () => {
  const adapter = new ClaudeMcpAdapter();

  it("deserializes claude mcp config", () => {
    const raw = JSON.stringify({
      preferences: { theme: "dark" },
      isUsingBuiltInNodeForMcp: true,
      mcpServers: {
        "my-server": {
          command: "npx",
          args: ["-y", "my-server"],
          env: { TOKEN: "abc123" },
        },
        "http-server": {
          url: "http://localhost:3000",
        },
      },
    });

    const servers = adapter.deserialize(raw);
    expect(servers.size).toBe(2);
    expect(servers.get("my-server")?.command).toBe("npx");
    expect(servers.get("http-server")?.url).toBe("http://localhost:3000");
  });

  it("serializes while preserving non-mcpServers keys", () => {
    const existing = JSON.stringify({
      preferences: { theme: "dark" },
      isUsingBuiltInNodeForMcp: true,
      mcpServers: {},
    });

    const servers = new Map();
    servers.set("test", { command: "node", args: ["server.js"] });

    const result = JSON.parse(adapter.serialize(servers, existing));
    expect(result.preferences).toEqual({ theme: "dark" });
    expect(result.isUsingBuiltInNodeForMcp).toBe(true);
    expect(result.mcpServers.test.command).toBe("node");
  });

  it("handles empty existing config", () => {
    const servers = new Map();
    servers.set("test", { command: "npx", args: ["-y", "test"] });

    const result = JSON.parse(adapter.serialize(servers, ""));
    expect(result.mcpServers.test.command).toBe("npx");
  });
});
