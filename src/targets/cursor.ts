import { TargetAdapter, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

export class CursorAdapter extends TargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["cursor"]);
  }

  deserialize(raw: string): Map<string, SerializedServer> {
    const parsed = JSON.parse(raw);
    const servers = new Map<string, SerializedServer>();
    const mcpServers = parsed.mcpServers ?? {};
    for (const [id, config] of Object.entries(mcpServers)) {
      servers.set(id, config as SerializedServer);
    }
    return servers;
  }

  serialize(
    servers: Map<string, SerializedServer>,
    existingRaw: string
  ): string {
    let existing: Record<string, unknown> = {};
    if (existingRaw) {
      try {
        existing = JSON.parse(existingRaw);
      } catch {
        existing = {};
      }
    }

    const mcpServers: Record<string, SerializedServer> = {};
    for (const [id, server] of servers) {
      mcpServers[id] = server;
    }

    return JSON.stringify({ ...existing, mcpServers }, null, 2) + "\n";
  }
}
