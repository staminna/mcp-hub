import { describe, it, expect, vi } from "vitest";
import { writeFileSync } from "fs";
import { join } from "path";
import { watchConfig, summarize, isWatched } from "../src/sync/watch.js";
import { validateConfig } from "../src/config/validate.js";
import { type HubConfig, type HealthResult, type McpServer, type SyncResult } from "../src/types.js";
import { hubDir, config, server } from "./helpers.js";

const result = (over: Partial<SyncResult> = {}): SyncResult => ({
  target: "cursor", added: [], unmanaged: [], skipped: [], updated: [], unchanged: [], backedUp: false, ...over,
});

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

// macOS may drop an fs event fired right after a watch starts, so keep writing until it's seen
const touchUntil = async (cond: () => boolean, file = "mcp-hub.json") => {
  const end = Date.now() + 5000;
  for (let i = 0; !cond(); i++) {
    if (Date.now() > end) throw new Error("timed out");
    writeFileSync(join(hubDir(), file), `{"n": ${i}}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};

const good = () => config([server({ id: "a" })]);

/** A watcher with fakes; returns what it logged and how sync was called */
function fake(opts: Parameters<typeof watchConfig>[0] = {}) {
  const logs: string[] = [];
  const sync = vi.fn(async (_c: HubConfig, _dry: boolean) => [result({ added: ["a"] })]);
  const health = vi.fn(async (s: McpServer): Promise<HealthResult> => ({ serverId: s.id, status: "healthy", checkedAt: "" }));
  const stop = watchConfig({ debounceMs: 20, load: async () => good(), sync, health, log: (m) => logs.push(m), ...opts });
  return { logs, sync, health, stop };
}

describe("summarize", () => {
  it("lists only targets that changed or failed", () => {
    expect(summarize([result(), result({ target: "windsurf", unchanged: ["a"] })])).toBe("no changes");
    const s = summarize([
      result({ added: ["a"], updated: ["b", "c"], skipped: [{ id: "d", missing: ["X"] }] }),
      result({ target: "windsurf", error: "boom" }),
      result({ target: "claude-mcp" }),
    ]);
    expect(s).toContain("cursor +1 ~2 1 held back (missing in .env)");
    expect(s).toContain("windsurf ✗ boom");
    expect(s).not.toContain("claude-mcp");
  });
});

describe("isWatched", () => {
  it("matches only the hub config and .env", () => {
    expect(isWatched("mcp-hub.json")).toBe(true);
    expect(isWatched(".env")).toBe(true);
    expect(isWatched("unrelated.txt")).toBe(false);
    expect(isWatched(null)).toBe(false);
  });
});

describe("validateConfig", () => {
  it("accepts a good config", () => {
    expect(validateConfig(good())).toEqual([]);
    expect(validateConfig(config([server({ id: "r", transport: "sse", command: undefined, url: "https://r", targets: ["cursor"], env: { A: "b" } })]))).toEqual([]);
  });

  it("names every problem a half-finished edit can leave", () => {
    expect(validateConfig(null)).toEqual(["mcp-hub.json has no servers list"]);
    expect(validateConfig({ servers: {} })).toEqual(["mcp-hub.json has no servers list"]);
    const problems = validateConfig({
      servers: [
        "x",
        { name: "", transport: "stdio", command: " ", targets: "*" },
        { id: "a", name: "a", transport: "stdio", command: "npx", targets: "*" },
        { id: "a", name: "a", transport: "http", targets: "*" },
        { id: "u", name: "u", transport: "streamable-http", url: "not a url", targets: ["nope"] },
        { id: "v", name: "v", transport: "stdio", command: "npx", args: [1], env: { K: 2 }, targets: "*" },
      ],
    });
    expect(problems).toEqual([
      "server #1 isn't an object",
      "server #2: missing id",
      "server #2: missing name",
      "server #2: stdio server needs a command",
      "a: duplicate id",
      'a: unknown transport "http"',
      "u: remote server needs a valid url",
      'u: targets must be "*" or a list of editors',
      "v: args must be a list of strings",
      "v: env values must be strings",
    ]);
    expect(validateConfig({ servers: [], settings: { disabledTargets: ["cursor"] } })).toEqual([]);
    expect(validateConfig({ servers: [], settings: { disabledTargets: ["nope"] } })).toEqual([
      "settings.disabledTargets must be a list of editors",
    ]);
  });
});

describe("watchConfig", () => {
  it("in review mode (the default) only does a dry run, and says where to review", async () => {
    const { logs, sync, stop } = fake({ reviewAt: "http://localhost:1/#/diff" });
    try {
      await touchUntil(() => logs.length > 0);
      expect(sync.mock.calls[0][1]).toBe(true); // dryRun
      expect(logs[0]).toContain("not written yet: cursor +1");
      expect(logs[0]).toContain("review on http://localhost:1/#/diff");
      expect(logs[0]).toContain("health: a ✓");
    } finally {
      stop();
    }
  });

  it("in review mode says when editors already match, and warns about an unfinished config", async () => {
    const sync = vi.fn(async () => [result()]);
    const a = fake({ sync });
    try {
      await touchUntil(() => a.logs.length > 0);
      expect(a.logs[0]).toContain("editors already match");
    } finally {
      a.stop();
    }
    const b = fake({ load: async () => config([server({ id: "a", command: "" })]) });
    try {
      await touchUntil(() => b.logs.length > 0, ".env");
      expect(b.logs[0]).toContain("looks unfinished: a: stdio server needs a command");
    } finally {
      b.stop();
    }
  });

  it("in auto mode syncs a valid config and holds back an invalid one", async () => {
    const ok = fake({ mode: "auto" });
    try {
      await touchUntil(() => ok.logs.length > 0);
      expect(ok.sync.mock.calls.map((c) => c[1])).toEqual([true, false]); // look, then write
      expect(ok.logs[0]).toContain("synced: cursor +1");
      expect(ok.logs[0]).toContain("health: a ✓");
    } finally {
      ok.stop();
    }
    const bad = fake({ mode: "auto", load: async () => config([server({ id: "a", transport: "sse", command: undefined })]) });
    try {
      await touchUntil(() => bad.logs.length > 0);
      expect(bad.sync).not.toHaveBeenCalled();
      expect(bad.logs[0]).toContain("not synced: fix mcp-hub.json first");
      expect(bad.logs[0]).toContain("a: remote server needs a valid url");
    } finally {
      bad.stop();
    }
  });

  it("health-checks only servers that would change, and says so in review mode", async () => {
    const two = config([server({ id: "a" }), server({ id: "b" })]);
    const { logs, stop } = fake({
      load: async () => two,
      health: vi.fn(async (s: McpServer): Promise<HealthResult> => ({ serverId: s.id, status: "unhealthy", error: "HTTP 401", checkedAt: "" })),
    });
    try {
      await touchUntil(() => logs.length > 0);
      expect(logs[0]).toContain("health: a ✗ HTTP 401");
      expect(logs[0]).not.toContain("b ✗");
      expect(logs[0]).toContain("not written yet"); // review never writes
    } finally {
      stop();
    }
  });

  it("skips the health line when the changed entries aren't hub servers", async () => {
    const { logs, health, stop } = fake({ sync: vi.fn(async () => [result({ added: ["ghost"] })]) });
    try {
      await touchUntil(() => logs.length > 0);
      expect(health).not.toHaveBeenCalled();
      expect(logs[0]).toContain("not written yet");
      expect(logs[0]).not.toContain("health:");
    } finally {
      stop();
    }
  });

  it("in auto mode holds back servers that fail their check and syncs the rest", async () => {
    const two = config([server({ id: "a" }), server({ id: "b" })]);
    const sync = vi.fn(async (c: HubConfig, _dry: boolean) => [result({ added: c.servers.map((s) => s.id) })]);
    const health = vi.fn(async (s: McpServer): Promise<HealthResult> =>
      s.id === "a" ? { serverId: "a", status: "unhealthy", checkedAt: "" } : { serverId: s.id, status: "healthy", checkedAt: "" });
    const { logs, stop } = fake({ mode: "auto", load: async () => two, sync, health });
    try {
      await touchUntil(() => logs.length > 0);
      const written = sync.mock.calls.find((c) => c[1] === false)!;
      expect(written[0].servers.map((s) => s.id)).toEqual(["b"]);
      expect(logs[0]).toContain("synced: cursor +1");
      expect(logs[0]).toContain("a ✗ unhealthy");
      expect(logs[0]).toContain("held back (failed health check): a");
    } finally {
      stop();
    }
  });

  it("in auto mode writes nothing when every changed server fails its check", async () => {
    const sync = vi.fn(async (c: HubConfig, _dry: boolean) => [result({ added: c.servers.map((s) => s.id) })]);
    const health = vi.fn(async (s: McpServer): Promise<HealthResult> => ({ serverId: s.id, status: "unhealthy", error: "HTTP 401", checkedAt: "" }));
    const { logs, stop } = fake({ mode: "auto", sync, health });
    try {
      await touchUntil(() => logs.length > 0);
      expect(sync.mock.calls.every((c) => c[1] === true)).toBe(true);
      expect(logs[0]).toContain("nothing synced");
      expect(logs[0]).toContain("held back (failed health check): a");
    } finally {
      stop();
    }
  });

  it("checks once per burst of changes, ignoring other files", async () => {
    const { logs, sync, stop } = fake({ debounceMs: 400 });
    try {
      await new Promise((r) => setTimeout(r, 200)); // let the watch settle before the burst
      writeFileSync(join(hubDir(), "unrelated.txt"), "ignored");
      writeFileSync(join(hubDir(), "mcp-hub.json"), "{}");
      writeFileSync(join(hubDir(), ".env"), "A=1\n");
      writeFileSync(join(hubDir(), "mcp-hub.json"), "{ }");
      await until(() => sync.mock.calls.length > 0);
      await new Promise((r) => setTimeout(r, 800));
      expect(sync).toHaveBeenCalledTimes(1);
      expect(logs).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it("checks again when a change lands mid-check", async () => {
    let release!: () => void;
    const sync = vi
      .fn<(c: HubConfig, d: boolean) => Promise<SyncResult[]>>()
      .mockImplementationOnce(() => new Promise((r) => (release = () => r([]))))
      .mockResolvedValue([]);
    const { stop } = fake({ sync });
    try {
      await touchUntil(() => sync.mock.calls.length === 1);
      writeFileSync(join(hubDir(), "mcp-hub.json"), "{ }");
      await new Promise((r) => setTimeout(r, 300));
      expect(sync).toHaveBeenCalledTimes(1); // still busy
      release();
      await until(() => sync.mock.calls.length === 2);
    } finally {
      stop();
    }
  });

  it("logs a config it can't read (e.g. half-saved JSON) and keeps watching", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("bad json")).mockRejectedValueOnce("plain");
    const { logs, stop } = fake({ load });
    try {
      await touchUntil(() => logs.length >= 1);
      await touchUntil(() => logs.length >= 2);
      expect(logs[0]).toContain("couldn't be read: bad json");
      expect(logs[1]).toContain("couldn't be read: plain");
    } finally {
      stop();
    }
  });

  it("uses the real config, sync and console by default, without writing", async () => {
    writeFileSync(join(hubDir(), "mcp-hub.json"), JSON.stringify(good()));
    const logs: string[] = [];
    const orig = console.log;
    console.log = (m: string) => logs.push(m);
    const stop = watchConfig({ debounceMs: 20 });
    try {
      const end = Date.now() + 5000;
      while (!logs.length) {
        if (Date.now() > end) throw new Error("timed out");
        writeFileSync(join(hubDir(), "mcp-hub.json"), JSON.stringify(good(), null, logs.length + 1));
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(logs[0]).toMatch(/not written yet|already match/);
      expect(logs[0]).toContain("the Changes page");
    } finally {
      console.log = orig;
      stop();
    }
  });
});
