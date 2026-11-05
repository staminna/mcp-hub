import type {
  McpServer,
  HealthResult,
  SyncResult,
  DiscoveryResult,
  TargetName,
} from "../../src/types.ts";

export type { McpServer, HealthResult, SyncResult, DiscoveryResult, TargetName };

export interface TargetInfo {
  name: TargetName;
  label: string;
  icon: string;
  path: string;
  exists: boolean;
}

export interface TargetDiff {
  name: TargetName;
  label: string;
  hasChanges: boolean;
  before: string;
  after: string;
}

export interface SkillEntry {
  id: string;
  source: string;
  path: string;
  name: string;
  description: string;
}

export interface MemoryEntry {
  project: string;
  projectDir: string;
  file: string;
  path: string;
  name: string;
  description: string;
  type?: string;
  isIndex: boolean;
}

export type ContentKind = "skills" | "memories";
export type ContentEntry = SkillEntry | MemoryEntry;

export interface MarkdownFile {
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export type NewServer = Partial<McpServer> & { name: string };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      message = JSON.parse(text).error ?? message;
    } catch {
      // not JSON — keep the raw text
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const q = encodeURIComponent;

export const api = {
  servers: () => request<McpServer[]>("GET", "/api/servers"),
  server: (id: string) => request<McpServer>("GET", `/api/servers/${q(id)}`),
  createServer: (s: NewServer) => request<McpServer>("POST", "/api/servers", s),
  updateServer: (id: string, s: Partial<McpServer>) =>
    request<McpServer>("PUT", `/api/servers/${q(id)}`, s),
  deleteServer: (id: string) => request<void>("DELETE", `/api/servers/${q(id)}`),
  toggleServer: (id: string) => request<McpServer>("POST", `/api/servers/${q(id)}/toggle`),
  checkHealth: (id: string) => request<HealthResult>("POST", `/api/servers/${q(id)}/health`),

  targets: () => request<TargetInfo[]>("GET", "/api/targets"),
  syncTarget: (name: TargetName) => request<SyncResult>("POST", `/api/targets/${name}/sync`),
  syncAll: () => request<SyncResult[]>("POST", "/api/sync/all"),
  diff: () => request<{ targets: TargetDiff[] }>("GET", "/api/sync/diff"),

  discoverNpm: (query: string) =>
    request<DiscoveryResult[]>("GET", `/api/discover/npm?q=${q(query)}`),
  discoverRunning: () => request<DiscoveryResult[]>("GET", "/api/discover/running"),
  discoverRegistry: () => request<DiscoveryResult[]>("GET", "/api/discover/registry"),

  importFrom: (target: TargetName) => request<{ logs: string[] }>("POST", `/api/import/${target}`),

  listContent: <K extends ContentKind>(kind: K) =>
    request<K extends "skills" ? SkillEntry[] : MemoryEntry[]>("GET", `/api/${kind}`),
  readContent: (kind: ContentKind, path: string) =>
    request<MarkdownFile>("GET", `/api/${kind}/file?path=${q(path)}`),
  saveContent: (kind: ContentKind, path: string, content: string) =>
    request<{ ok: true }>("PUT", `/api/${kind}/file`, { path, content }),
};

/** Which targets a server syncs to, given the list of all targets. */
export function serverTargets(s: McpServer, all: TargetName[]): TargetName[] {
  return s.targets === "*" ? all : s.targets;
}

/** One-line summary of how a server is launched. */
export function launchLine(s: McpServer): string {
  if (s.transport !== "stdio") return s.url ?? "";
  return [s.command, ...(s.args ?? [])].filter(Boolean).join(" ");
}
