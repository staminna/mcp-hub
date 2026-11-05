import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { type McpServer, type TargetName, type TargetConfig } from "../types.js";

export interface SerializedServer {
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  env?: Record<string, string>;
  disabled?: boolean;
  disabledTools?: string[];
  [key: string]: unknown;
}

export abstract class TargetAdapter {
  constructor(public readonly config: TargetConfig) {}

  get name(): TargetName {
    return this.config.name;
  }

  get configPath(): string {
    return this.config.configPath;
  }

  exists(): boolean {
    return existsSync(this.configPath);
  }

  async readRaw(): Promise<string> {
    if (!this.exists()) return "";
    return readFile(this.configPath, "utf-8");
  }

  async writeRaw(content: string): Promise<void> {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    // Atomic write: write to .tmp then rename
    const tmpPath = this.configPath + ".tmp";
    await writeFile(tmpPath, content, "utf-8");
    const { rename } = await import("fs/promises");
    await rename(tmpPath, this.configPath);
  }

  /** Extract MCP servers from the IDE config */
  abstract deserialize(raw: string): Map<string, SerializedServer>;

  /** Convert hub servers into the IDE's format */
  abstract serialize(
    servers: Map<string, SerializedServer>,
    existingRaw: string
  ): string;

  /** Convert a hub McpServer to this target's format */
  toSerializedServer(server: McpServer): SerializedServer {
    const s: SerializedServer = {};
    if (server.transport === "stdio") {
      if (server.command) s.command = server.command;
      if (server.args?.length) s.args = server.args;
      if (server.cwd) s.cwd = server.cwd;
    } else {
      if (server.url) s.url = server.url;
    }
    if (server.env && Object.keys(server.env).length > 0) s.env = server.env;
    if (server.disabled) s.disabled = true;
    if (server.disabledTools?.length) s.disabledTools = server.disabledTools;
    return s;
  }

  /** Convert a serialized server back to a hub McpServer */
  fromSerializedServer(id: string, s: SerializedServer): Partial<McpServer> {
    const server: Partial<McpServer> = { id, name: id };
    if (s.command) {
      server.transport = "stdio";
      server.command = s.command;
      if (s.args) server.args = s.args as string[];
      if (s.cwd) server.cwd = s.cwd as string;
    } else if (s.url) {
      server.transport = "streamable-http";
      server.url = s.url;
    }
    if (s.env) server.env = s.env as Record<string, string>;
    server.disabled = !!s.disabled;
    if (s.disabledTools) server.disabledTools = s.disabledTools as string[];
    return server;
  }

  /** Read servers from this IDE config */
  async read(): Promise<Map<string, SerializedServer>> {
    const raw = await this.readRaw();
    if (!raw) return new Map();
    return this.deserialize(raw);
  }

  /** Write servers to this IDE config, preserving other keys */
  async write(servers: Map<string, SerializedServer>): Promise<void> {
    const existingRaw = await this.readRaw();
    const content = this.serialize(servers, existingRaw);
    await this.writeRaw(content);
  }

  /**
   * Merge hub servers into the existing config. Non-destructive: servers
   * already in the IDE config that the hub doesn't manage are kept as-is.
   */
  async merge(hubServers: McpServer[]): Promise<void> {
    const serialized = await this.read();
    for (const server of hubServers) {
      serialized.set(server.id, this.toSerializedServer(server));
    }
    await this.write(serialized);
  }
}

/**
 * Parse an editor's existing JSON config. Throws on anything that isn't a JSON
 * object: falling back to {} and writing would wipe the user's file.
 */
export function parseExistingJson(raw: string, path: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${path} isn't valid JSON, so it wasn't changed`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} isn't a JSON object, so it wasn't changed`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * An editor that keeps its servers under one key of a JSON file. Writing only
 * replaces that key; every other key in the file is kept as it was.
 */
export abstract class JsonTargetAdapter extends TargetAdapter {
  protected serversKey = "mcpServers";

  deserialize(raw: string): Map<string, SerializedServer> {
    const parsed = parseExistingJson(raw, this.configPath);
    const servers = (parsed[this.serversKey] ?? {}) as Record<string, SerializedServer>;
    return new Map(Object.entries(servers));
  }

  serialize(servers: Map<string, SerializedServer>, existingRaw: string): string {
    const existing = parseExistingJson(existingRaw, this.configPath);
    return JSON.stringify({ ...existing, [this.serversKey]: Object.fromEntries(servers) }, null, 2) + "\n";
  }
}
