import {
  type HubConfig,
  type McpServer,
  type TargetName,
  type SyncResult,
} from "../types.js";
import { getAdapter, getTargetNames } from "../targets/registry.js";
import { createBackup } from "./backup.js";
import { computeDiff } from "./diff.js";
import { loadEnvFile } from "../secrets/env-file.js";
import { resolveServer } from "../secrets/manager.js";

/**
 * Enabled hub servers for a target, with ${VAR} references resolved from .env.
 * Servers with unresolvable vars are returned in `skipped` and must not be
 * written — the IDE keeps whatever it has for them.
 */
export async function getServersForTarget(
  config: HubConfig,
  target: TargetName,
  envFile?: Record<string, string>
): Promise<{ servers: McpServer[]; skipped: SyncResult["skipped"] }> {
  const env = envFile ?? (await loadEnvFile());
  const servers: McpServer[] = [];
  const skipped: SyncResult["skipped"] = [];
  for (const s of config.servers) {
    if (s.disabled) continue;
    if (s.targets !== "*" && !s.targets.includes(target)) continue;
    const { server, missing } = resolveServer(s, env);
    if (missing.length > 0) skipped.push({ id: s.id, missing });
    else servers.push(server);
  }
  return { servers, skipped };
}

export async function syncTarget(
  config: HubConfig,
  targetName: TargetName,
  dryRun = false
): Promise<SyncResult> {
  const adapter = getAdapter(targetName);
  const { servers, skipped } = await getServersForTarget(config, targetName);
  const diff = (await computeDiff(targetName, servers)).filter(
    // A skipped server still in the IDE config isn't "unmanaged" — it's held back
    (d) => !(d.action === "unmanaged" && skipped.some((s) => s.id === d.serverId))
  );

  const result: SyncResult = {
    target: targetName,
    added: diff.filter((d) => d.action === "add").map((d) => d.serverId),
    updated: diff.filter((d) => d.action === "update").map((d) => d.serverId),
    unchanged: diff
      .filter((d) => d.action === "unchanged")
      .map((d) => d.serverId),
    unmanaged: diff
      .filter((d) => d.action === "unmanaged")
      .map((d) => d.serverId),
    skipped,
    backedUp: false,
  };

  if (dryRun) return result;

  // Safety net: never write to an IDE config from an empty hub. An empty list
  // almost always means the hub config wasn't found, not an intentional state.
  if (config.servers.length === 0) {
    result.error =
      "hub has no servers (is mcp-hub.json missing?) — refusing to sync";
    return result;
  }

  const hasChanges =
    result.added.length > 0 || result.updated.length > 0;

  if (!hasChanges) return result;

  try {
    // Backup if enabled
    if (config.settings.autoBackup && adapter.exists()) {
      const backupPath = await createBackup(
        targetName,
        adapter.configPath,
        config.settings.backupDir
      );
      result.backedUp = !!backupPath;
    }

    // Write the new config
    await adapter.merge(servers);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

export async function syncAll(
  config: HubConfig,
  dryRun = false
): Promise<SyncResult[]> {
  const targets = getTargetNames();
  const results: SyncResult[] = [];

  for (const target of targets) {
    const result = await syncTarget(config, target, dryRun);
    results.push(result);
  }

  return results;
}
