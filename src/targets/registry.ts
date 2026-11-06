import { type HubConfig, type TargetName } from "../types.js";
import { TargetAdapter } from "./base.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { ClaudeMcpAdapter } from "./claude-mcp.js";
import { ClaudeDesktopAdapter } from "./claude-desktop.js";
import { ClaudeSettingsAdapter } from "./claude-settings.js";
import { VscodeAdapter } from "./vscode.js";
import { WindsurfAdapter } from "./windsurf.js";
import { CursorAdapter } from "./cursor.js";
import { GeminiAdapter } from "./gemini.js";
import { DockerAdapter } from "./docker.js";
import { UnityAdapter } from "./unity.js";

const adapters: Record<TargetName, () => TargetAdapter> = {
  "claude-code": () => new ClaudeCodeAdapter(),
  "claude-mcp": () => new ClaudeMcpAdapter(),
  "claude-desktop": () => new ClaudeDesktopAdapter(),
  "claude-settings": () => new ClaudeSettingsAdapter(),
  vscode: () => new VscodeAdapter(),
  windsurf: () => new WindsurfAdapter(),
  cursor: () => new CursorAdapter(),
  gemini: () => new GeminiAdapter(),
  docker: () => new DockerAdapter(),
  unity: () => new UnityAdapter(),
};

export function getAdapter(target: TargetName): TargetAdapter {
  const factory = adapters[target];
  if (!factory) throw new Error(`Unknown target: ${target}`);
  return factory();
}

export function getAllAdapters(): TargetAdapter[] {
  return Object.values(adapters).map((f) => f());
}

export function isTargetName(name: string): name is TargetName {
  return Object.hasOwn(adapters, name);
}

/** For CLI flags: print a clear error (instead of a stack trace) and set the exit code. */
export function checkTargetName(name: string | undefined): name is TargetName | undefined {
  if (name === undefined || isTargetName(name)) return true;
  console.error(`  Unknown editor "${name}". Choose one of: ${getTargetNames().join(", ")}`);
  process.exitCode = 1;
  return false;
}

export function getTargetNames(): TargetName[] {
  return Object.keys(adapters) as TargetName[];
}

/** An editor is on unless it's listed in settings.disabledTargets. */
export function isTargetEnabled(config: HubConfig, target: TargetName): boolean {
  return !(config.settings.disabledTargets ?? []).includes(target);
}

export function getEnabledTargetNames(config: HubConfig): TargetName[] {
  return getTargetNames().filter((t) => isTargetEnabled(config, t));
}
