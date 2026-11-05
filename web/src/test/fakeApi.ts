import { vi } from "vitest";
import type { McpServer, TargetInfo, TargetDiff, SkillEntry, MemoryEntry, DiscoveryResult, SyncResult, HealthResult, SecretVar } from "../api.ts";

export interface FakeState {
  servers: McpServer[];
  targets: TargetInfo[];
  diff: TargetDiff[];
  skills: SkillEntry[];
  memories: MemoryEntry[];
  files: Record<string, string>;
  registry: DiscoveryResult[];
  npm: DiscoveryResult[];
  running: DiscoveryResult[];
  health: Record<string, HealthResult>;
  sync: Record<string, Partial<SyncResult>>;
  importLogs: string[];
  secrets: SecretVar[];
  /** Values written through the fake (the real API never returns them) */
  secretValues: Record<string, string>;
  /** "METHOD /path" (path without query) → forced failure */
  fail: Record<string, { status: number; body?: string }>;
  /** "METHOD /path" → promise to await before answering */
  delay: Record<string, Promise<void>>;
  calls: { method: string; path: string; body?: unknown }[];
}

export const server = (o: Partial<McpServer> & { id: string }): McpServer => ({
  name: o.id,
  transport: "stdio",
  command: "npx",
  args: ["-y", `${o.id}-mcp`],
  tags: [],
  disabled: false,
  targets: "*",
  ...o,
});

export function defaultState(): FakeState {
  return {
    servers: [
      server({ id: "fetch", tags: ["web"], targets: ["claude-code", "cursor"] }),
      server({ id: "remote", transport: "streamable-http", command: undefined, args: undefined, url: "https://example.com/mcp", env: { TOKEN: "${REMOTE_TOKEN}", MODE: "fast" } }),
      server({ id: "off", disabled: true }),
    ],
    targets: [
      { name: "claude-code", label: "Claude Code", icon: "C", path: "~/.claude.json", exists: true },
      { name: "cursor", label: "Cursor", icon: "K", path: "~/.cursor/mcp.json", exists: false },
    ],
    diff: [
      { name: "claude-code", label: "Claude Code", hasChanges: false, servers: [] },
      {
        name: "cursor",
        label: "Cursor",
        hasChanges: true,
        servers: [
          { id: "added", action: "add", fields: [] },
          { id: "fetch", action: "update", fields: ["command", "args"] },
        ],
      },
    ],
    skills: [
      { id: "alpha", source: "claude", path: "/s/alpha/SKILL.md", name: "Alpha", description: "First skill" },
      { id: "beta", source: "gemini", path: "/s/beta/SKILL.md", name: "Beta", description: "" },
    ],
    memories: [
      { project: "~/proj", projectDir: "-p", file: "MEMORY.md", path: "/m/MEMORY.md", name: "MEMORY", description: "", isIndex: true },
      { project: "~/proj", projectDir: "-p", file: "note.md", path: "/m/note.md", name: "note", description: "A note", type: "project", isIndex: false },
    ],
    files: {
      "/s/alpha/SKILL.md": "---\nname: Alpha\nmeta:\n  a: 1\n---\n# Alpha heading\n\nBody <script>alert(1)</script>",
      "/s/beta/SKILL.md": "Plain beta",
      "/m/MEMORY.md": "- [note](note.md)",
      "/m/note.md": "---\nname: note\n---\nNote body",
    },
    registry: [{ name: "@modelcontextprotocol/server-filesystem", source: "registry", description: "Files" }],
    npm: [{ name: "postgres-mcp-server", source: "npm" }],
    running: [{ name: "proc", source: "process", description: "Running process: node mcp.js" }],
    health: {},
    sync: {},
    importLogs: ["\x1b[32m  + fetch\x1b[39m", "1 imported"],
    secrets: [
      { name: "REMOTE_TOKEN", source: "missing", usedBy: ["remote"] },
      { name: "SHELL_VAR", source: "environment", usedBy: [] },
      { name: "STRIPE_KEY", source: "env-file", usedBy: ["fetch", "remote"] },
    ],
    secretValues: {},
    fail: {},
    delay: {},
    calls: [],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function parseFrontmatter(content: string) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { frontmatter: {}, body: content };
  const fm: Record<string, unknown> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0 && !line.startsWith(" ")) {
      const v = line.slice(i + 1).trim();
      fm[line.slice(0, i)] = v === "" ? { a: 1 } : v;
    }
  }
  return { frontmatter: fm, body: content.slice(m[0].length) };
}

const syncResult = (st: FakeState, target: string): SyncResult => ({
  target: target as SyncResult["target"],
  added: [],
  updated: [],
  unchanged: [],
  unmanaged: [],
  skipped: [],
  backedUp: false,
  ...st.sync[target],
});

export function installFakeApi(overrides: Partial<FakeState> = {}): FakeState {
  const st: FakeState = { ...defaultState(), ...overrides };
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    st.calls.push({ method, path, body });
    const key = `${method} ${path}`;
    if (key in st.delay) await st.delay[key];
    const f = st.fail[key];
    if (f) return new Response(f.body ?? "", { status: f.status });

    let m: RegExpMatchArray | null;
    if (key === "GET /api/servers") return json(st.servers);
    if (key === "POST /api/servers") {
      const s = server({ ...body, id: body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
      st.servers.push(s);
      return json(s, 201);
    }
    if ((m = path.match(/^\/api\/servers\/([^/]+)(\/toggle|\/health)?$/))) {
      const id = decodeURIComponent(m[1]);
      const i = st.servers.findIndex((s) => s.id === id);
      if (i < 0) return json({ error: "Not found" }, 404);
      if (m[2] === "/toggle") {
        st.servers[i] = { ...st.servers[i], disabled: !st.servers[i].disabled };
        return json(st.servers[i]);
      }
      if (m[2] === "/health") return json(st.health[id] ?? { serverId: id, status: "healthy", checkedAt: "now" });
      if (method === "GET") return json(st.servers[i]);
      if (method === "PUT") {
        st.servers[i] = { ...body, id };
        return json(st.servers[i]);
      }
      if (method === "DELETE") {
        st.servers.splice(i, 1);
        return new Response(null, { status: 204 });
      }
    }
    if (key === "GET /api/secrets") return json(st.secrets);
    if ((m = path.match(/^\/api\/secrets\/([^/]+)$/))) {
      const name = decodeURIComponent(m[1]);
      if (method === "PUT") {
        st.secretValues[name] = body.value;
        const v = st.secrets.find((x) => x.name === name);
        if (v) v.source = "env-file";
        else st.secrets.push({ name, source: "env-file", usedBy: [] });
        return json({ name, source: "env-file" });
      }
      st.secrets = st.secrets.filter((x) => x.name !== name);
      return new Response(null, { status: 204 });
    }
    if (key === "GET /api/targets") return json(st.targets);
    if ((m = path.match(/^\/api\/targets\/([^/]+)\/sync$/))) return json(syncResult(st, m[1]));
    if (key === "POST /api/sync/all") return json(st.targets.map((t) => syncResult(st, t.name)));
    if (key === "GET /api/sync/diff") return json({ targets: st.diff });
    if (key === "GET /api/discover/registry") return json(st.registry);
    if (key === "GET /api/discover/running") return json(st.running);
    if (key === "GET /api/discover/npm") return json(st.npm);
    if (path.startsWith("/api/import/")) return json({ logs: st.importLogs });
    if ((m = path.match(/^\/api\/(skills|memories)(\/file)?$/))) {
      if (!m[2]) return json(m[1] === "skills" ? st.skills : st.memories);
      if (method === "GET") {
        const p = url.searchParams.get("path")!;
        const content = st.files[p];
        if (content === undefined) return json({ error: "file does not exist" }, 400);
        return json({ content, ...parseFrontmatter(content) });
      }
      st.files[body.path] = body.content;
      return json({ ok: true });
    }
    return json({ error: `no fake for ${key}` }, 500);
  };
  vi.stubGlobal("fetch", vi.fn(handler));
  return st;
}
