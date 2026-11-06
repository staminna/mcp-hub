import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { type HubConfig, type McpServer, type TargetName } from "../types.js";
import { HUB_CONFIG_PATH, DEFAULT_HUB_SETTINGS } from "./defaults.js";

function defaultConfig(): HubConfig {
  return {
    version: 1,
    servers: [],
    settings: { ...DEFAULT_HUB_SETTINGS },
  };
}

export async function loadConfig(path?: string): Promise<HubConfig> {
  const configPath = path ?? HUB_CONFIG_PATH;
  if (!existsSync(configPath)) {
    return defaultConfig();
  }
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as HubConfig;
  return {
    ...defaultConfig(),
    ...parsed,
    settings: { ...DEFAULT_HUB_SETTINGS, ...parsed.settings },
  };
}

export async function saveConfig(
  config: HubConfig,
  path?: string
): Promise<void> {
  const configPath = path ?? HUB_CONFIG_PATH;
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function findServer(
  config: HubConfig,
  id: string
): McpServer | undefined {
  return config.servers.find((s) => s.id === id);
}

export function addServer(config: HubConfig, server: McpServer): HubConfig {
  const existing = config.servers.findIndex((s) => s.id === server.id);
  const servers = [...config.servers];
  if (existing >= 0) {
    servers[existing] = server;
  } else {
    servers.push(server);
  }
  return { ...config, servers };
}

export function removeServer(config: HubConfig, id: string): HubConfig {
  return {
    ...config,
    servers: config.servers.filter((s) => s.id !== id),
  };
}

/** Turn an editor on or off for sync (stored as settings.disabledTargets). */
export function setTargetEnabled(config: HubConfig, target: TargetName, enabled: boolean): HubConfig {
  const off = (config.settings.disabledTargets ?? []).filter((t) => t !== target);
  if (!enabled) off.push(target);
  return { ...config, settings: { ...config.settings, disabledTargets: off } };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
