import { TargetAdapter, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

const PRESERVE_KEYS = ["permissions"];

export class ClaudeSettingsAdapter extends TargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["claude-settings"]);
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

    const result: Record<string, unknown> = {};
    for (const key of PRESERVE_KEYS) {
      if (key in existing) result[key] = existing[key];
    }

    const mcpServers: Record<string, SerializedServer> = {};
    for (const [id, server] of servers) {
      mcpServers[id] = server;
    }
    result.mcpServers = mcpServers;

    return JSON.stringify(result, null, 2) + "\n";
  }
}
