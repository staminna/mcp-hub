import { describe, it, expect } from "vitest";
import { type McpServer, type HubConfig } from "../src/types.js";

function makeConfig(servers: McpServer[]): HubConfig {
  return {
    version: 1,
    servers,
    settings: {
      backupDir: "/tmp/test-backups",
      autoBackup: false,
      defaultTargets: ["claude-mcp"],
    },
  };
}

describe("sync engine - server filtering", () => {
  it("filters servers by target", () => {
    const servers: McpServer[] = [
      {
        id: "s1",
        name: "s1",
        transport: "stdio",
        command: "node",
        tags: [],
        disabled: false,
        targets: ["claude-mcp", "cursor"],
      },
      {
        id: "s2",
        name: "s2",
        transport: "stdio",
        command: "node",
        tags: [],
        disabled: false,
        targets: ["windsurf"],
      },
      {
        id: "s3",
        name: "s3",
        transport: "stdio",
        command: "node",
        tags: [],
        disabled: false,
        targets: "*",
      },
    ];

    const config = makeConfig(servers);

    // Replicate the filter logic from engine.ts
    const forClaude = config.servers.filter((s) => {
      if (s.disabled) return false;
      if (s.targets === "*") return true;
      return s.targets.includes("claude-mcp");
    });

    expect(forClaude.map((s) => s.id)).toEqual(["s1", "s3"]);

    const forWindsurf = config.servers.filter((s) => {
      if (s.disabled) return false;
      if (s.targets === "*") return true;
      return s.targets.includes("windsurf");
    });

    expect(forWindsurf.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("excludes disabled servers", () => {
    const servers: McpServer[] = [
      {
        id: "s1",
        name: "s1",
        transport: "stdio",
        command: "node",
        tags: [],
        disabled: true,
        targets: "*",
      },
    ];

    const config = makeConfig(servers);
    const active = config.servers.filter((s) => !s.disabled);
    expect(active).toHaveLength(0);
  });
});

// ── Non-destructive sync ────────────────────────────────────────────────
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ClaudeMcpAdapter } from "../src/targets/claude-mcp.js";
import { syncTarget } from "../src/sync/engine.js";

describe("sync engine - never removes servers", () => {
  it("merge() keeps servers the hub doesn't manage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcphub-"));
    const path = join(dir, "mcp_config.json");
    await writeFile(
      path,
      JSON.stringify({
        mcpServers: {
          mine: { command: "node", args: ["keep-me.js"] },
          shared: { command: "old" },
        },
      })
    );

    const adapter = new ClaudeMcpAdapter();
    (adapter as { config: unknown }).config = { ...adapter.config, configPath: path };

    await adapter.merge([
      { id: "shared", name: "shared", transport: "stdio", command: "new", tags: [], disabled: false, targets: "*" },
      { id: "added", name: "added", transport: "stdio", command: "npx", tags: [], disabled: false, targets: "*" },
    ]);

    const result = JSON.parse(await readFile(path, "utf-8"));
    expect(result.mcpServers.mine).toEqual({ command: "node", args: ["keep-me.js"] });
    expect(result.mcpServers.shared.command).toBe("new");
    expect(result.mcpServers.added.command).toBe("npx");
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses to sync from an empty hub", async () => {
    // Real target, but the guard returns before anything is written.
    const result = await syncTarget(makeConfig([]), "unity", false);
    expect(result.error).toMatch(/refusing to sync/);
  });
});

// ── .env resolution ─────────────────────────────────────────────────────
import { resolveServer } from "../src/secrets/manager.js";
import { getServersForTarget } from "../src/sync/engine.js";

describe("sync engine - ${VAR} resolution", () => {
  const withToken = (id: string, ref: string): McpServer => ({
    id, name: id, transport: "stdio", command: "npx", args: ["--key=${ARG_KEY}"],
    env: { URL: "https://x", TOKEN: ref }, tags: [], disabled: false, targets: "*",
  });

  it("replaces ${VAR} in env and args with .env values", () => {
    const { server, missing } = resolveServer(withToken("a", "${A_TOKEN}"), { A_TOKEN: "real", ARG_KEY: "k" });
    expect(missing).toEqual([]);
    expect(server.env).toEqual({ URL: "https://x", TOKEN: "real" });
    expect(server.args).toEqual(["--key=k"]);
  });

  it("reports missing vars instead of writing placeholders", () => {
    const { missing } = resolveServer(withToken("a", "${NOPE_TOKEN}"), { ARG_KEY: "k" });
    expect(missing).toEqual(["NOPE_TOKEN"]);
  });

  it("holds back servers with unresolved vars", async () => {
    const config = makeConfig([withToken("ok", "${OK_TOKEN}"), withToken("bad", "${BAD_TOKEN}")]);
    const { servers, skipped } = await getServersForTarget(config, "cursor", { OK_TOKEN: "t", ARG_KEY: "k" });
    expect(servers.map((s) => s.id)).toEqual(["ok"]);
    expect(servers[0].env!.TOKEN).toBe("t");
    expect(skipped).toEqual([{ id: "bad", missing: ["BAD_TOKEN"] }]);
  });
});
