import { TargetAdapter, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

export class VscodeAdapter extends TargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["vscode"]);
  }

  deserialize(raw: string): Map<string, SerializedServer> {
    const parsed = JSON.parse(raw);
    const servers = new Map<string, SerializedServer>();
    // VS Code uses "mcp" → "servers" structure in settings.json
    const mcpServers = parsed.mcpServers ?? parsed.mcp?.servers ?? {};
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

    // Preserve all existing keys
    const result: Record<string, unknown> = { ...existing };

    const mcpServers: Record<string, SerializedServer> = {};
    for (const [id, server] of servers) {
      mcpServers[id] = server;
    }
    result.mcpServers = mcpServers;

    return JSON.stringify(result, null, 2) + "\n";
  }
}
