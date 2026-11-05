import { describe, it, expect } from "vitest";
import { WindsurfAdapter } from "../../src/targets/windsurf.js";

describe("WindsurfAdapter", () => {
  const adapter = new WindsurfAdapter();

  it("deserializes windsurf config", () => {
    const raw = JSON.stringify({
      mcpServers: {
        "directus-staging": {
          command: "npx",
          args: ["-y", "directus-mcp-server"],
          env: { DIRECTUS_URL: "https://staging.example.com" },
          disabled: true,
          disabledTools: ["write_items"],
        },
      },
    });

    const servers = adapter.deserialize(raw);
    expect(servers.size).toBe(1);
    const s = servers.get("directus-staging")!;
    expect(s.command).toBe("npx");
    expect(s.disabled).toBe(true);
    expect(s.disabledTools).toEqual(["write_items"]);
  });

  it("serializes preserving extra keys", () => {
    const existing = JSON.stringify({
      someOtherKey: true,
      mcpServers: {},
    });

    const servers = new Map();
    servers.set("test", { command: "node", args: ["index.js"] });

    const result = JSON.parse(adapter.serialize(servers, existing));
    expect(result.someOtherKey).toBe(true);
    expect(result.mcpServers.test.command).toBe("node");
  });
});
