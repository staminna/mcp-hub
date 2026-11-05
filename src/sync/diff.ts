import { type McpServer, type TargetName, type DiffEntry } from "../types.js";
import { getAdapter } from "../targets/registry.js";
import { type SerializedServer } from "../targets/base.js";

export async function computeDiff(
  targetName: TargetName,
  hubServers: McpServer[]
): Promise<DiffEntry[]> {
  const adapter = getAdapter(targetName);
  const entries: DiffEntry[] = [];

  // Get current state from IDE config
  const currentServers = await adapter.read();

  // Build desired state from hub
  const desiredServers = new Map<string, SerializedServer>();
  for (const server of hubServers) {
    desiredServers.set(server.id, adapter.toSerializedServer(server));
  }

  // Check for additions and updates
  for (const [id, desired] of desiredServers) {
    const current = currentServers.get(id);
    if (!current) {
      entries.push({
        target: targetName,
        serverId: id,
        action: "add",
        after: desired as Record<string, unknown>,
      });
    } else {
      const currentJson = JSON.stringify(current);
      const desiredJson = JSON.stringify(desired);
      if (currentJson !== desiredJson) {
        entries.push({
          target: targetName,
          serverId: id,
          action: "update",
          before: current as Record<string, unknown>,
          after: desired as Record<string, unknown>,
        });
      } else {
        entries.push({
          target: targetName,
          serverId: id,
          action: "unchanged",
        });
      }
    }
  }

  // Servers in the IDE but not in the hub are never removed — report them
  // as "unmanaged" so the user can see them, but sync leaves them alone.
  for (const [id] of currentServers) {
    if (!desiredServers.has(id)) {
      entries.push({
        target: targetName,
        serverId: id,
        action: "unmanaged",
        before: currentServers.get(id) as Record<string, unknown>,
      });
    }
  }

  return entries;
}
