import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, existsSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { syncTarget, syncAll, getServersForTarget } from "../src/sync/engine.js";
import { computeDiff } from "../src/sync/diff.js";
import { createBackup } from "../src/sync/backup.js";
import { getAdapter } from "../src/targets/registry.js";
import { HUB_ENV_PATH } from "../src/config/defaults.js";
import { server, config, write, readJson, remove, home } from "./helpers.js";

const cursor = getAdapter("cursor");

beforeEach(() => {
  remove(join(home(), ".cursor"));
  remove(join(home(), "backups"));
  remove(HUB_ENV_PATH);
});

describe("getServersForTarget", () => {
  it("picks enabled servers for the target and resolves vars", async () => {
    const cfg = config([
      server({ id: "all" }),
      server({ id: "cursor-only", targets: ["cursor"] }),
      server({ id: "elsewhere", targets: ["windsurf"] }),
      server({ id: "off", disabled: true }),
      server({ id: "needs-var", env: { T: "${MISSING_X}" } }),
      server({ id: "has-var", env: { T: "${HAVE}" } }),
    ]);
    const { servers, skipped } = await getServersForTarget(cfg, "cursor", { HAVE: "v" });
    expect(servers.map((s) => s.id)).toEqual(["all", "cursor-only", "has-var"]);
    expect(servers[2].env).toEqual({ T: "v" });
    expect(skipped).toEqual([{ id: "needs-var", missing: ["MISSING_X"] }]);
  });

  it("reads .env when no env is passed", async () => {
    write(HUB_ENV_PATH, "HAVE=from-file\n");
    const { servers } = await getServersForTarget(config([server({ env: { T: "${HAVE}" } })]), "cursor");
    expect(servers[0].env).toEqual({ T: "from-file" });
  });
});

describe("computeDiff", () => {
  it("labels add, update, unchanged and unmanaged", async () => {
    write(cursor.configPath, { mcpServers: {
      same: { command: "node", args: ["server.js"] },
      changed: { command: "old" },
      theirs: { command: "t" },
    } });
    const diff = await computeDiff("cursor", [server({ id: "same" }), server({ id: "changed" }), server({ id: "new" })]);
    const by = Object.fromEntries(diff.map((d) => [d.serverId, d]));
    expect(by.same.action).toBe("unchanged");
    expect(by.changed.action).toBe("update");
    expect(by.changed.before).toEqual({ command: "old" });
    expect(by.new.action).toBe("add");
    expect(by.theirs.action).toBe("unmanaged");
    expect(by.theirs.before).toEqual({ command: "t" });
  });
});

describe("syncTarget", () => {
  it("dry run reports changes without writing", async () => {
    const r = await syncTarget(config([server()]), "cursor", true);
    expect(r.added).toEqual(["s1"]);
    expect(existsSync(cursor.configPath)).toBe(false);
  });

  it("writes, backs up, and keeps unmanaged servers", async () => {
    write(cursor.configPath, { mcpServers: { theirs: { command: "t" } } });
    const r = await syncTarget(config([server()], { autoBackup: true }), "cursor");
    expect(r).toMatchObject({ added: ["s1"], unmanaged: ["theirs"], backedUp: true });
    expect(Object.keys(readJson(cursor.configPath).mcpServers).sort()).toEqual(["s1", "theirs"]);
    const backups = readdirSync(join(home(), "backups", "cursor"));
    expect(backups).toHaveLength(1);
    expect(readJson(join(home(), "backups", "cursor", backups[0])).mcpServers).toEqual({ theirs: { command: "t" } });
  });

  it("does nothing when already in sync", async () => {
    const cfg = config([server()]);
    await syncTarget(cfg, "cursor");
    const r = await syncTarget(cfg, "cursor");
    expect(r).toMatchObject({ added: [], updated: [], unchanged: ["s1"] });
  });

  it("updates a changed server and skips backup when autoBackup is off", async () => {
    write(cursor.configPath, { mcpServers: { s1: { command: "old" } } });
    const r = await syncTarget(config([server()]), "cursor");
    expect(r).toMatchObject({ updated: ["s1"], backedUp: false });
    expect(existsSync(join(home(), "backups"))).toBe(false);
  });

  it("refuses to write from an empty hub", async () => {
    write(cursor.configPath, { mcpServers: { theirs: { command: "t" } } });
    const r = await syncTarget(config([]), "cursor");
    expect(r.error).toMatch(/refusing to sync/);
    expect(readJson(cursor.configPath).mcpServers).toEqual({ theirs: { command: "t" } });
  });

  it("holds back servers with missing vars and doesn't call them unmanaged", async () => {
    write(cursor.configPath, { mcpServers: { secret: { command: "keep" } } });
    const r = await syncTarget(config([server(), server({ id: "secret", env: { T: "${NOT_SET_ANYWHERE}" } })]), "cursor");
    expect(r.skipped).toEqual([{ id: "secret", missing: ["NOT_SET_ANYWHERE"] }]);
    expect(r.unmanaged).toEqual([]);
    expect(readJson(cursor.configPath).mcpServers.secret).toEqual({ command: "keep" });
  });

  it("reports write errors (an unparseable file is left alone)", async () => {
    write(cursor.configPath, "{ broken");
    const r = await syncTarget(config([server()]), "cursor");
    expect(r.error).toMatch(/isn't valid JSON/);
    // and syncAll carries on with the other editors
    const all = await syncAll(config([server()]));
    expect(all.find((x) => x.target === "cursor")!.error).toMatch(/isn't valid JSON/);
    expect(all.find((x) => x.target === "windsurf")!.added).toEqual(["s1"]);
  });

  it("reports write errors (no permission)", async () => {
    write(cursor.configPath, { mcpServers: {} });
    const dir = dirname(cursor.configPath);
    chmodSync(dir, 0o500); // can't create the .tmp file
    try {
      const r = await syncTarget(config([server()]), "cursor");
      expect(r.error).toMatch(/EACCES|permission/i);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});

describe("syncAll", () => {
  it("returns one result per target", async () => {
    const results = await syncAll(config([server({ targets: ["cursor"] })]), true);
    expect(results).toHaveLength(9);
    expect(results.find((r) => r.target === "cursor")!.added).toEqual(["s1"]);
  });
});

describe("createBackup", () => {
  it("returns null when there is nothing to back up", async () => {
    expect(await createBackup("cursor", join(home(), "nope.json"), join(home(), "backups"))).toBeNull();
  });
  it("keeps the yaml extension for yaml configs", async () => {
    const p = join(home(), "c.yaml");
    write(p, "a: 1\n");
    const b = await createBackup("docker", p, join(home(), "backups"));
    expect(b).toMatch(/backups\/docker\/.+\.yaml$/);
    const y = join(home(), "c.yml");
    write(y, "a: 1\n");
    expect(await createBackup("docker", y, join(home(), "backups"))).toMatch(/\.yaml$/);
  });
});

describe("editor names that differ from the hub id only by case or punctuation", () => {
  it("updates the editor's existing entry instead of adding a near-duplicate", async () => {
    write(cursor.configPath, { mcpServers: { AbletonMCP: { command: "old" }, "team.example.com": { command: "t" } } });
    const cfg = config([server({ id: "abletonmcp" }), server({ id: "team-example-com" })]);
    const dry = await syncTarget(cfg, "cursor", true);
    expect(dry).toMatchObject({ added: [], updated: ["AbletonMCP", "team.example.com"], unmanaged: [] });
    await syncTarget(cfg, "cursor");
    const out = readJson(cursor.configPath).mcpServers;
    expect(Object.keys(out)).toEqual(["AbletonMCP", "team.example.com"]);
    expect(out.AbletonMCP.command).toBe("node");
    expect((await syncTarget(cfg, "cursor")).unchanged).toEqual(["AbletonMCP", "team.example.com"]);
  });

  it("prefers an exact match when both spellings exist", async () => {
    write(cursor.configPath, { mcpServers: { AbletonMCP: { command: "theirs" }, abletonmcp: { command: "old" } } });
    await syncTarget(config([server({ id: "abletonmcp" })]), "cursor");
    const out = readJson(cursor.configPath).mcpServers;
    expect(out).toEqual({ AbletonMCP: { command: "theirs" }, abletonmcp: { command: "node", args: ["server.js"] } });
  });

  it("doesn't call a held-back server unmanaged under its editor spelling", async () => {
    write(cursor.configPath, { mcpServers: { "My.Secret": { command: "keep" } } });
    const r = await syncTarget(config([server(), server({ id: "my-secret", env: { T: "${NOT_SET_X}" } })]), "cursor");
    expect(r.unmanaged).toEqual([]);
    expect(readJson(cursor.configPath).mcpServers["My.Secret"]).toEqual({ command: "keep" });
  });
});
