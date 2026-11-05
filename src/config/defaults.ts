import { type TargetConfig, type TargetName, type HubSettings } from "../types.js";
import { homedir } from "os";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const home = homedir();

export const TARGET_CONFIGS: Record<TargetName, TargetConfig> = {
  "claude-code": {
    name: "claude-code",
    displayName: "Claude Code",
    configPath: join(home, ".claude.json"),
    format: "json",
  },
  "claude-mcp": {
    name: "claude-mcp",
    displayName: "Claude Desktop (MCP)",
    configPath: join(home, ".claude", "mcp_config.json"),
    format: "json",
  },
  "claude-settings": {
    name: "claude-settings",
    displayName: "Claude Desktop (Settings)",
    configPath: join(home, ".claude", "settings.local.json"),
    format: "json",
  },
  windsurf: {
    name: "windsurf",
    displayName: "Windsurf",
    configPath: join(home, ".codeium", "windsurf", "mcp_config.json"),
    format: "json",
  },
  vscode: {
    name: "vscode",
    displayName: "VS Code",
    configPath: join(home, ".vscode", "mcp.json"),
    format: "json",
  },
  cursor: {
    name: "cursor",
    displayName: "Cursor",
    configPath: join(home, ".cursor", "mcp.json"),
    format: "json",
  },
  gemini: {
    name: "gemini",
    displayName: "Gemini CLI",
    configPath: join(home, ".gemini", "settings.json"),
    format: "json",
  },
  docker: {
    name: "docker",
    displayName: "Docker MCP",
    configPath: join(home, ".docker", "mcp", "config.yaml"),
    format: "yaml",
  },
  unity: {
    name: "unity",
    displayName: "Unity MCP",
    configPath: join(home, ".unity-mcp", "config.json"),
    format: "json",
  },
};

export const DEFAULT_HUB_SETTINGS: HubSettings = {
  backupDir: join(home, ".mcp-hub", "backups"),
  autoBackup: true,
  defaultTargets: ["claude-mcp", "windsurf", "cursor"],
};

// Hub home: MCP_HUB_HOME if set, otherwise the project root
// (this file lives in src/config/ or dist/config/, two levels below the root).
export const HUB_HOME =
  process.env.MCP_HUB_HOME ??
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const HUB_CONFIG_PATH = join(HUB_HOME, "mcp-hub.json");
export const HUB_ENV_PATH = join(HUB_HOME, ".env");
