import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { type Server } from "http";
import { join } from "path";
import { createServer } from "../src/server/index.js";
import { HUB_CONFIG_PATH, HUB_ENV_PATH } from "../src/config/defaults.js";
import { saveConfig, loadConfig } from "../src/config/store.js";
import { getAdapter } from "../src/targets/registry.js";
import { server, config, write, read, readJson, remove, home } from "./helpers.js";

let srv: Server;
let base = "";
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = undefined;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, type: res.headers.get("content-type") ?? "" };
};

const node = process.execPath;
beforeAll(async () => {
  srv = createServer().listen(0);
  await new Promise((r) => srv.once("listening", r));
  const a = srv.address();
  base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
afterAll(() => srv.close());

beforeEach(async () => {
  remove(join(home(), ".cursor"));
  remove(HUB_ENV_PATH);
  await saveConfig(config([
    server({ id: "alpha", name: "Alpha", command: node, args: ["-e", "process.exit(0)"], targets: ["cursor"] }),
    server({ id: "beta", name: "Beta", disabled: true, targets: ["cursor"] }),
  ]));
});

describe("servers API", () => {
  it("lists and gets servers", async () => {
    expect((await api("GET", "/api/servers")).json.map((s: any) => s.id)).toEqual(["alpha", "beta"]);
    expect((await api("GET", "/api/servers/alpha")).json.name).toBe("Alpha");
    expect((await api("GET", "/api/servers/nope")).status).toBe(404);
  });

  it("creates servers with defaults and an id from the name", async () => {
    const r = await api("POST", "/api/servers", { name: "My New Server", command: "npx" });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ id: "my-new-server", transport: "stdio", tags: [], disabled: false, targets: "*" });
    const full = await api("POST", "/api/servers", {
      id: "x", name: "X", transport: "sse", url: "http://x", tags: ["t"], disabled: true, targets: ["cursor"], description: "d",
    });
    expect(full.json).toMatchObject({ id: "x", transport: "sse", tags: ["t"], disabled: true, targets: ["cursor"] });
    expect((await api("POST", "/api/servers", {})).status).toBe(400);
  });

  it("replaces a server on PUT, so cleared fields are removed", async () => {
    await api("PUT", "/api/servers/alpha", { name: "Alpha", command: "node", cwd: "/somewhere" });
    const r = await api("PUT", "/api/servers/alpha", { name: "Alpha 2", command: "node", id: "ignored" });
    expect(r.json).toEqual({ tags: [], disabled: false, targets: "*", transport: "stdio", name: "Alpha 2", command: "node", id: "alpha" });
    expect((await loadConfig()).servers.find((s) => s.id === "alpha")!.cwd).toBeUndefined();
    expect((await api("PUT", "/api/servers/alpha", { command: "x" })).status).toBe(400);
    expect((await api("PUT", "/api/servers/nope", { name: "n" })).status).toBe(404);
  });

  it("deletes and toggles", async () => {
    expect((await api("POST", "/api/servers/beta/toggle")).json.disabled).toBe(false);
    expect((await api("POST", "/api/servers/nope/toggle")).status).toBe(404);
    expect((await api("DELETE", "/api/servers/beta")).status).toBe(204);
    expect((await api("DELETE", "/api/servers/beta")).status).toBe(404);
    expect((await loadConfig()).servers.map((s) => s.id)).toEqual(["alpha"]);
  });

  it("checks health of one server and of all enabled ones", async () => {
    expect((await api("POST", "/api/servers/alpha/health")).json.status).toBe("healthy");
    expect((await api("POST", "/api/servers/nope/health")).status).toBe(404);
    const all = (await api("GET", "/api/health")).json;
    expect(all.map((r: any) => r.serverId)).toEqual(["alpha"]);
  });

  it("returns JSON 500 instead of crashing when mcp-hub.json is broken", async () => {
    write(HUB_CONFIG_PATH, "{ broken");
    const r = await api("GET", "/api/servers");
    expect(r.status).toBe(500);
    expect(r.json.error).toMatch(/JSON/);
    expect((await api("GET", "/api/targets")).status).toBe(200); // server still up
  });
});

describe("targets and sync API", () => {
  it("lists targets with ~ paths and whether they exist", async () => {
    write(getAdapter("cursor").configPath, { mcpServers: {} });
    const ts = (await api("GET", "/api/targets")).json;
    expect(ts).toHaveLength(9);
    expect(ts.find((t: any) => t.name === "cursor")).toMatchObject({ label: "Cursor", icon: "⌨️", path: "~/.cursor/mcp.json", exists: true });
    expect(ts.find((t: any) => t.name === "vscode").exists).toBe(false);
  });

  it("syncs one target, keeping unmanaged servers", async () => {
    write(getAdapter("cursor").configPath, { mcpServers: { theirs: { command: "t" } } });
    const r = await api("POST", "/api/targets/cursor/sync");
    expect(r.json).toMatchObject({ target: "cursor", added: ["alpha"], unmanaged: ["theirs"] });
    expect(Object.keys(readJson(getAdapter("cursor").configPath).mcpServers).sort()).toEqual(["alpha", "theirs"]);
    expect((await api("POST", "/api/targets/nope/sync")).status).toBe(400);
  });

  it("syncs every target", async () => {
    const r = await api("POST", "/api/sync/all");
    expect(r.json).toHaveLength(9);
  });

  it("diffs every target with ids and field names, never values", async () => {
    write(HUB_ENV_PATH, "ALPHA_TOKEN=sentinel-token-value-123\n");
    await saveConfig(config([
      server({ id: "alpha", env: { T: "${ALPHA_TOKEN}" }, targets: ["cursor"] }),
      server({ id: "fresh", targets: ["cursor"] }),
    ]));
    write(getAdapter("cursor").configPath, { mcpServers: {
      alpha: { command: "node", args: ["server.js"], env: { T: "old-real-token-456" } },
      theirs: { command: "t" },
    } });
    const r = await api("GET", "/api/sync/diff");
    expect(r.text).not.toContain("sentinel-token-value-123");
    expect(r.text).not.toContain("old-real-token-456");
    const c = r.json.targets.find((t: any) => t.name === "cursor");
    expect(c).toEqual({
      name: "cursor", label: "Cursor", hasChanges: true,
      servers: [{ id: "alpha", action: "update", fields: ["env.T"] }, { id: "fresh", action: "add", fields: [] }],
    });
    expect(r.json.targets.find((t: any) => t.name === "vscode")).toMatchObject({ hasChanges: false, servers: [] });
  });

  it("reports an unreadable editor config in the diff instead of diffing against {}", async () => {
    write(getAdapter("cursor").configPath, "{ broken");
    const c = (await api("GET", "/api/sync/diff")).json.targets.find((t: any) => t.name === "cursor");
    expect(c).toMatchObject({ hasChanges: false });
    expect(c.error).toMatch(/isn't valid JSON/);
  });
});

describe("import API", () => {
  it("imports from an editor and returns the log", async () => {
    write(getAdapter("cursor").configPath, { mcpServers: { fresh: { command: "f" } } });
    const r = await api("POST", "/api/import/cursor");
    expect(r.json.logs.join("\n")).toMatch(/\+ fresh/);
    expect((await loadConfig()).servers.map((s) => s.id)).toContain("fresh");
  });

  it("rejects unknown editors with JSON 400", async () => {
    const r = await api("POST", "/api/import/nope");
    expect(r).toMatchObject({ status: 400, json: { error: "Unknown target: nope" } });
  });

  it("restores console.log and returns JSON 500 when the import fails", async () => {
    write(getAdapter("cursor").configPath, { mcpServers: { fresh: { command: "f" } } });
    write(HUB_CONFIG_PATH, "{ broken");
    const log = console.log;
    const r = await api("POST", "/api/import/cursor");
    expect(r.status).toBe(500);
    expect(console.log).toBe(log);
  });
});

describe("discover API", () => {
  it("serves the registry, npm search and running processes", async () => {
    expect((await api("GET", "/api/discover/registry")).json.length).toBeGreaterThan(0);
    expect((await api("GET", "/api/discover/registry?q=github")).json).toHaveLength(1);
    expect(Array.isArray((await api("GET", "/api/discover/running")).json)).toBe(true);
    const orig = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).startsWith("https://registry.npmjs.org")) {
        return new Response(JSON.stringify({ objects: [{ package: { name: String(url).includes("text=mcp-server") ? "default" : "q" } }] }));
      }
      return orig(url as string, init);
    });
    try {
      expect((await api("GET", "/api/discover/npm?q=x")).json[0].name).toBe("q");
      expect((await api("GET", "/api/discover/npm")).json[0].name).toBe("default");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("skills and memories API", () => {
  const skill = () => join(home(), ".claude", "skills", "demo", "SKILL.md");
  const memory = () => join(home(), ".claude", "projects", "-proj", "memory", "note.md");
  beforeEach(() => {
    write(skill(), "---\nname: demo\ndescription: A demo\n---\n# Demo\n");
    write(memory(), "---\nname: note\n---\nremember\n");
  });

  it("lists, reads and writes files in place", async () => {
    expect((await api("GET", "/api/skills")).json.map((s: any) => s.id)).toEqual(["demo"]);
    expect((await api("GET", "/api/memories")).json.map((m: any) => m.file)).toEqual(["note.md"]);
    const f = (await api("GET", `/api/skills/file?path=${encodeURIComponent(skill())}`)).json;
    expect(f).toMatchObject({ frontmatter: { name: "demo" }, body: "# Demo\n" });
    expect((await api("PUT", "/api/memories/file", { path: memory(), content: "new" })).json).toEqual({ ok: true });
    expect(read(memory())).toBe("new");
  });

  it("refuses paths outside the folders, bad bodies and missing files", async () => {
    expect((await api("GET", "/api/skills/file?path=/etc/hosts")).status).toBe(400);
    expect((await api("GET", "/api/skills/file")).status).toBe(400);
    expect((await api("PUT", "/api/skills/file", { path: skill() })).status).toBe(400);
    expect((await fetch(base + "/api/skills/file", { method: "PUT" })).status).toBe(400); // no body
    expect((await api("PUT", "/api/skills/file", { path: "/tmp/x.md", content: "x" })).status).toBe(400);
  });
});

describe("localhost-only guard", () => {
  const raw = (path: string, method: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      // fetch won't let us set Host, so use http directly
      import("http").then(({ request }) => {
        const req = request(base + path, { method, headers }, (res) => { res.resume(); resolve(res.statusCode!); });
        req.on("error", reject);
        req.end();
      });
    });

  it("rejects requests for another host name (DNS rebinding)", async () => {
    expect(await raw("/api/servers", "GET", { Host: "evil.example" })).toBe(403);
    expect(await raw("/api/servers", "GET", { Host: "localhost:3847" })).toBe(200);
    expect(await raw("/api/servers", "GET", { Host: "[::1]:3847" })).toBe(200);
  });

  it("rejects writes from other sites, allows the dashboard, the dev proxy and the CLI", async () => {
    const before = (await loadConfig()).servers.map((s) => s.disabled);
    expect(await raw("/api/servers/alpha/toggle", "POST", { Host: "127.0.0.1", Origin: "https://evil.example" })).toBe(403);
    expect(await raw("/api/servers/alpha/toggle", "POST", { Host: "127.0.0.1", "Sec-Fetch-Site": "cross-site" })).toBe(403);
    expect(await raw("/api/servers/alpha/toggle", "POST", { Host: "127.0.0.1", Origin: "not a url" })).toBe(403);
    expect((await loadConfig()).servers.map((s) => s.disabled)).toEqual(before);
    expect(await raw("/api/servers/alpha/toggle", "POST", { Host: "localhost:3847", Origin: "http://localhost:3847", "Sec-Fetch-Site": "same-origin" })).toBe(200);
    expect(await raw("/api/servers/alpha/toggle", "POST", { Host: "localhost:3847", Origin: "http://localhost:5173" })).toBe(200);
    expect(await raw("/api/servers/alpha/toggle", "POST", { Host: "127.0.0.1" })).toBe(200);
    // Reading from another origin's page is still blocked by the browser (no CORS headers); GETs aren't Origin-checked
    expect(await raw("/api/servers", "GET", { Host: "127.0.0.1", Origin: "https://evil.example" })).toBe(200);
  });

  it("accepts an extra host chosen with --host", async () => {
    const s2 = createServer({ hosts: ["Mybox.lan"] }).listen(0);
    await new Promise((r) => s2.once("listening", r));
    const a = s2.address();
    const port = typeof a === "object" && a ? a.port : 0;
    const { request } = await import("http");
    const code = await new Promise<number>((resolve) => {
      request(`http://127.0.0.1:${port}/api/servers`, { headers: { Host: `mybox.lan:${port}` } }, (res) => { res.resume(); resolve(res.statusCode!); }).end();
    });
    expect(code).toBe(200);
    s2.close();
  });
});

describe("dashboard", () => {
  it("serves the built dashboard when it exists", async () => {
    const r = await api("GET", "/");
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/html/);
  });

  it("explains how to build it when it doesn't", async () => {
    vi.resetModules();
    vi.doMock("fs", async (orig) => {
      const fs = await orig<typeof import("fs")>();
      return { ...fs, existsSync: (p: string) => (String(p).endsWith(join("web", "index.html")) ? false : fs.existsSync(p)) };
    });
    const { createServer: fresh } = await import("../src/server/index.js");
    const s2 = fresh().listen(0);
    await new Promise((r) => s2.once("listening", r));
    const a = s2.address();
    const res = await fetch(`http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}/`);
    expect(await res.text()).toMatch(/npm run build/);
    s2.close();
    vi.doUnmock("fs");
  });
});

describe("secrets API (write-only .env)", () => {
  beforeEach(async () => {
    write(HUB_ENV_PATH, "# my tokens\nALPHA_TOKEN=sentinel-secret-789\nUNUSED=zzz-unused-value\n");
    await saveConfig(config([
      server({ id: "alpha", env: { T: "${ALPHA_TOKEN}" }, args: ["--key=${MISSING_KEY}"] }),
      server({ id: "beta", env: { T: "${ALPHA_TOKEN}", H: "${HOME}" } }),
    ]));
  });

  it("lists names, where each comes from and who uses it, never values", async () => {
    const r = await api("GET", "/api/secrets");
    expect(r.text).not.toContain("sentinel-secret-789");
    expect(r.text).not.toContain("zzz-unused-value");
    expect(r.json).toEqual([
      { name: "ALPHA_TOKEN", source: "env-file", usedBy: ["alpha", "beta"] },
      { name: "HOME", source: "environment", usedBy: ["beta"] },
      { name: "MISSING_KEY", source: "missing", usedBy: ["alpha"] },
      { name: "UNUSED", source: "env-file", usedBy: [] },
    ]);
  });

  it("sets and replaces values in .env, keeping comments; the response has no value", async () => {
    const r = await api("PUT", "/api/secrets/MISSING_KEY", { value: "  new-value  " });
    expect(r.json).toEqual({ name: "MISSING_KEY", source: "env-file" });
    await api("PUT", "/api/secrets/ALPHA_TOKEN", { value: "rotated" });
    expect(read(HUB_ENV_PATH)).toBe("# my tokens\nALPHA_TOKEN=rotated\nUNUSED=zzz-unused-value\nMISSING_KEY=new-value\n");
  });

  it("validates names and values", async () => {
    expect((await api("PUT", "/api/secrets/1BAD", { value: "x" })).json.error).toMatch(/letters, digits/);
    expect((await api("PUT", "/api/secrets/OK", { value: "  " })).json.error).toBe("Enter a value");
    expect((await api("PUT", "/api/secrets/OK", {})).status).toBe(400);
    expect((await api("PUT", "/api/secrets/OK", { value: "a\nB=injected" })).json.error).toMatch(/line breaks/);
    expect((await fetch(base + "/api/secrets/OK", { method: "PUT" })).status).toBe(400);
    expect(read(HUB_ENV_PATH)).not.toMatch(/injected|OK=/);
  });

  it("removes a key, or 404s if it isn't in .env", async () => {
    expect((await api("DELETE", "/api/secrets/UNUSED")).status).toBe(204);
    expect(read(HUB_ENV_PATH)).not.toMatch(/UNUSED/);
    expect((await api("DELETE", "/api/secrets/UNUSED")).status).toBe(404);
  });

  it("can't be changed from another site", async () => {
    const res = await fetch(base + "/api/secrets/ALPHA_TOKEN", {
      method: "PUT", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ value: "pwned" }),
    });
    expect(res.status).toBe(403);
    expect(read(HUB_ENV_PATH)).toMatch(/ALPHA_TOKEN=sentinel-secret-789/);
  });
});
