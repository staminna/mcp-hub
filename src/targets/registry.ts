import { type TargetName } from "../types.js";
import { TargetAdapter } from "./base.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { ClaudeMcpAdapter } from "./claude-mcp.js";
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

export function getTargetNames(): TargetName[] {
  return Object.keys(adapters) as TargetName[];
}
