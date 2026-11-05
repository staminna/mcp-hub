import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { type HubConfig, type McpServer } from "../src/types.js";

export const home = () => homedir();
export const hubDir = () => process.env.MCP_HUB_HOME!;

export function server(over: Partial<McpServer> = {}): McpServer {
  return {
    id: "s1",
    name: "s1",
    transport: "stdio",
    command: "node",
    args: ["server.js"],
    tags: [],
    disabled: false,
    targets: "*",
    ...over,
  };
}

export function config(servers: McpServer[], over: Partial<HubConfig["settings"]> = {}): HubConfig {
  return {
    version: 1,
    servers,
    settings: {
      backupDir: join(home(), "backups"),
      autoBackup: false,
      defaultTargets: ["claude-mcp"],
      ...over,
    },
  };
}

export function write(path: string, content: string | object): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

export function read(path: string): string {
  return readFileSync(path, "utf-8");
}

export function readJson<T = any>(path: string): T {
  return JSON.parse(read(path));
}

export function remove(path: string): void {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

/** Capture console.log output while fn runs. */
export async function captureLog(fn: () => unknown): Promise<string> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
}
