export type TransportType = "stdio" | "sse" | "streamable-http";

export type TargetName =
  | "claude-code"
  | "claude-mcp"
  | "claude-settings"
  | "vscode"
  | "windsurf"
  | "cursor"
  | "gemini"
  | "docker"
  | "unity";

export interface McpServer {
  id: string;
  name: string;
  description?: string;
  transport: TransportType;
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  env?: Record<string, string>;
  tags: string[];
  disabled: boolean;
  disabledTools?: string[];
  targets: TargetName[] | "*";
}

export interface HubConfig {
  version: number;
  servers: McpServer[];
  settings: HubSettings;
}

export interface HubSettings {
  backupDir: string;
  autoBackup: boolean;
  defaultTargets: TargetName[];
}

export interface TargetConfig {
  name: TargetName;
  displayName: string;
  configPath: string;
  format: "json" | "yaml";
}

export interface SyncResult {
  target: TargetName;
  added: string[];
  /** Servers in the IDE config that the hub does not manage — always preserved. */
  unmanaged: string[];
  /** Hub servers not written because a ${VAR} couldn't be resolved from .env. */
  skipped: Array<{ id: string; missing: string[] }>;
  updated: string[];
  unchanged: string[];
  backedUp: boolean;
  error?: string;
}

export interface HealthResult {
  serverId: string;
  status: "healthy" | "unhealthy" | "unknown";
  responseTimeMs?: number;
  error?: string;
  checkedAt: string;
}

export interface DiffEntry {
  target: TargetName;
  serverId: string;
  /** "unmanaged" = present in the IDE config but not in the hub; sync leaves it untouched. */
  action: "add" | "update" | "unchanged" | "unmanaged";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface DiscoveryResult {
  name: string;
  source: "npm" | "process" | "registry";
  description?: string;
  command?: string;
  url?: string;
  installCommand?: string;
}
