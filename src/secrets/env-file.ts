import { readFile } from "fs/promises";
import { writeFilePrivate } from "../fs/private.js";
import { existsSync } from "fs";
import { HUB_ENV_PATH } from "../config/defaults.js";

export async function loadEnvFile(
  path?: string
): Promise<Record<string, string>> {
  const envPath = path ?? HUB_ENV_PATH;
  if (!existsSync(envPath)) return {};

  const raw = await readFile(envPath, "utf-8");
  const env: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

export async function saveEnvFile(
  env: Record<string, string>,
  path?: string
): Promise<void> {
  const envPath = path ?? HUB_ENV_PATH;

  // Preserve comments and order from existing file
  let existingLines: string[] = [];
  if (existsSync(envPath)) {
    const raw = await readFile(envPath, "utf-8");
    existingLines = raw.split("\n");
    // Drop trailing blank lines so each save doesn't add another one
    while (existingLines.length && !existingLines[existingLines.length - 1].trim()) existingLines.pop();
  }

  const written = new Set<string>();
  const lines: string[] = [];

  for (const line of existingLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      lines.push(line);
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) {
      lines.push(line);
      continue;
    }
    const key = trimmed.substring(0, eqIdx).trim();
    if (key in env) {
      lines.push(`${key}=${env[key]}`);
      written.add(key);
    }
    // If key not in env, skip (removed)
  }

  // Add new keys
  for (const [key, value] of Object.entries(env)) {
    if (!written.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  await writeFilePrivate(envPath, lines.join("\n") + "\n");
}
