import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { loadConfig, saveConfig, findServer, addServer, removeServer, slugify, setTargetEnabled } from "../src/config/store.js";
import { type HubConfig, type McpServer } from "../src/types.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-test");
const TEST_CONFIG = join(TEST_DIR, "test-config.json");

function makeServer(id: string, overrides: Partial<McpServer> = {}): McpServer {
  return {
    id,
    name: id,
    transport: "stdio",
    command: "npx",
    args: ["-y", `@mcp/${id}`],
    tags: [],
    disabled: false,
    targets: "*",
    ...overrides,
  };
}

describe("config/store", () => {
  beforeEach(async () => {
    if (!existsSync(TEST_DIR)) await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true });
  });

  it("returns default config when file missing", async () => {
    const config = await loadConfig(join(TEST_DIR, "nonexistent.json"));
    expect(config.version).toBe(1);
    expect(config.servers).toEqual([]);
  });

  it("saves and loads config", async () => {
    const config: HubConfig = {
      version: 1,
      servers: [makeServer("test-server")],
      settings: {
        backupDir: "/tmp/backups",
        autoBackup: true,
        defaultTargets: ["claude-mcp"],
      },
    };
    await saveConfig(config, TEST_CONFIG);
    const loaded = await loadConfig(TEST_CONFIG);
    expect(loaded.servers).toHaveLength(1);
    expect(loaded.servers[0].id).toBe("test-server");
  });

  it("finds server by id", () => {
    const config: HubConfig = {
      version: 1,
      servers: [makeServer("alpha"), makeServer("beta")],
      settings: { backupDir: "", autoBackup: false, defaultTargets: [] },
    };
    expect(findServer(config, "alpha")?.id).toBe("alpha");
    expect(findServer(config, "gamma")).toBeUndefined();
  });

  it("adds server", () => {
    const config: HubConfig = {
      version: 1,
      servers: [makeServer("alpha")],
      settings: { backupDir: "", autoBackup: false, defaultTargets: [] },
    };
    const updated = addServer(config, makeServer("beta"));
    expect(updated.servers).toHaveLength(2);
  });

  it("updates existing server on add", () => {
    const config: HubConfig = {
      version: 1,
      servers: [makeServer("alpha", { disabled: false })],
      settings: { backupDir: "", autoBackup: false, defaultTargets: [] },
    };
    const updated = addServer(config, makeServer("alpha", { disabled: true }));
    expect(updated.servers).toHaveLength(1);
    expect(updated.servers[0].disabled).toBe(true);
  });

  it("removes server", () => {
    const config: HubConfig = {
      version: 1,
      servers: [makeServer("alpha"), makeServer("beta")],
      settings: { backupDir: "", autoBackup: false, defaultTargets: [] },
    };
    const updated = removeServer(config, "alpha");
    expect(updated.servers).toHaveLength(1);
    expect(updated.servers[0].id).toBe("beta");
  });
});

describe("slugify", () => {
  it("converts to lowercase slug", () => {
    expect(slugify("My Server Name")).toBe("my-server-name");
    expect(slugify("foo--bar")).toBe("foo-bar");
    expect(slugify("---hello---")).toBe("hello");
  });
});

describe("setTargetEnabled", () => {
  it("works on settings that have no disabledTargets yet, and never lists an editor twice", () => {
    const c = { version: 1, servers: [], settings: { backupDir: "b", autoBackup: false, defaultTargets: [] } } as HubConfig;
    const off = setTargetEnabled(c, "cursor", false);
    expect(off.settings.disabledTargets).toEqual(["cursor"]);
    expect(setTargetEnabled(off, "cursor", false).settings.disabledTargets).toEqual(["cursor"]);
    expect(setTargetEnabled(off, "cursor", true).settings.disabledTargets).toEqual([]);
    expect(c.settings.disabledTargets).toBeUndefined(); // input untouched
  });
});
