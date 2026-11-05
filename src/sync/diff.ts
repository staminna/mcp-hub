import { type McpServer, type TargetName, type DiffEntry } from "../types.js";
import { getAdapter } from "../targets/registry.js";
import { type SerializedServer, editorKey } from "../targets/base.js";

export async function computeDiff(
  targetName: TargetName,
  hubServers: McpServer[]
): Promise<DiffEntry[]> {
  const adapter = getAdapter(targetName);
  const entries: DiffEntry[] = [];

  // Get current state from IDE config
  const currentServers = await adapter.read();

  // Build desired state from hub, keyed the way the editor already names each server
  const desiredServers = new Map<string, SerializedServer>();
  for (const server of hubServers) {
    desiredServers.set(editorKey(currentServers, server.id), adapter.toSerializedServer(server));
  }

  // Check for additions and updates
  for (const [id, desired] of desiredServers) {
    const current = currentServers.get(id);
    if (!current) {
      entries.push({ target: targetName, serverId: id, action: "add", after: desired as Record<string, unknown> });
    } else if (JSON.stringify(current) !== JSON.stringify(desired)) {
      entries.push({
        target: targetName,
        serverId: id,
        action: "update",
        before: current as Record<string, unknown>,
        after: desired as Record<string, unknown>,
      });
    } else {
      entries.push({ target: targetName, serverId: id, action: "unchanged" });
    }
  }

  // Servers in the IDE but not in the hub are never removed — report them
  // as "unmanaged" so the user can see them, but sync leaves them alone.
  for (const [id, current] of currentServers) {
    if (!desiredServers.has(id)) {
      entries.push({ target: targetName, serverId: id, action: "unmanaged", before: current as Record<string, unknown> });
    }
  }

  return entries;
}

/** Top-level keys that differ, with env broken out per variable (e.g. "env.TOKEN"). */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[k], a = after[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    if (k === "env" && b && a && typeof b === "object" && typeof a === "object") {
      const be = b as Record<string, unknown>, ae = a as Record<string, unknown>;
      for (const e of new Set([...Object.keys(be), ...Object.keys(ae)])) {
        if (be[e] !== ae[e]) out.push(`env.${e}${e in be ? (e in ae ? "" : " (removed)") : " (new)"}`);
      }
    } else {
      out.push(k);
    }
  }
  return out;
}
