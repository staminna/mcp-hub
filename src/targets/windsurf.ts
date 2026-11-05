import { TargetAdapter, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

export class WindsurfAdapter extends TargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["windsurf"]);
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

    // Windsurf uses a flat mcpServers structure, supports disabled & disabledTools
    const mcpServers: Record<string, SerializedServer> = {};
    for (const [id, server] of servers) {
      mcpServers[id] = server;
    }

    return JSON.stringify({ ...existing, mcpServers }, null, 2) + "\n";
  }
}
