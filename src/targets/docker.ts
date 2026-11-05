import { TargetAdapter, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

export class DockerAdapter extends TargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["docker"]);
  }

  deserialize(raw: string): Map<string, SerializedServer> {
    // Dynamic import for yaml
    const servers = new Map<string, SerializedServer>();
    if (!raw.trim()) return servers;

    // Simple YAML parsing for Docker MCP config
    // Docker MCP uses a YAML format with mcpServers key
    try {
      // We'll use a simple approach — import yaml at runtime
      const lines = raw.split("\n");
      let currentServer: string | null = null;
      let currentConfig: SerializedServer = {};
      let inMcpServers = false;
      let inArgs = false;

      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed === "mcpServers:" || trimmed === "servers:") {
          inMcpServers = true;
          continue;
        }
        if (!inMcpServers) continue;

        // Top-level server entry (2 spaces)
        const serverMatch = trimmed.match(/^ {2}(\S+):$/);
        if (serverMatch) {
          if (currentServer) {
            servers.set(currentServer, currentConfig);
          }
          currentServer = serverMatch[1];
          currentConfig = {};
          inArgs = false;
          continue;
        }

        // Server properties (4 spaces)
        const propMatch = trimmed.match(/^ {4}(\w+):\s*(.*)$/);
        if (propMatch && currentServer) {
          const [, key, value] = propMatch;
          if (key === "args") {
            inArgs = true;
            currentConfig.args = [];
          } else {
            inArgs = false;
            (currentConfig as Record<string, unknown>)[key] = value.replace(
              /^["']|["']$/g,
              ""
            );
          }
          continue;
        }

        // Args list items (6 spaces)
        const argMatch = trimmed.match(/^ {6}- (.+)$/);
        if (argMatch && inArgs && currentConfig.args) {
          currentConfig.args.push(argMatch[1].replace(/^["']|["']$/g, ""));
        }
      }
      if (currentServer) {
        servers.set(currentServer, currentConfig);
      }
    } catch {
      // If YAML parsing fails, return empty
    }
    return servers;
  }

  serialize(
    servers: Map<string, SerializedServer>,
    _existingRaw: string
  ): string {
    const lines: string[] = ["mcpServers:"];

    for (const [id, server] of servers) {
      lines.push(`  ${id}:`);
      if (server.command) lines.push(`    command: "${server.command}"`);
      if (server.args?.length) {
        lines.push(`    args:`);
        for (const arg of server.args) {
          lines.push(`      - "${arg}"`);
        }
      }
      if (server.url) lines.push(`    url: "${server.url}"`);
      if (server.env) {
        lines.push(`    env:`);
        for (const [k, v] of Object.entries(server.env)) {
          lines.push(`      ${k}: "${v}"`);
        }
      }
    }

    return lines.join("\n") + "\n";
  }
}
