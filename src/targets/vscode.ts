import { JsonTargetAdapter, parseExistingJson, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";
import { type McpServer } from "../types.js";

/**
 * VS Code mcp.json: servers live under "servers" and each needs a "type".
 * Older hub versions wrote "mcpServers"; those are still read.
 */
export class VscodeAdapter extends JsonTargetAdapter {
  protected serversKey = "servers";

  constructor() {
    super(TARGET_CONFIGS["vscode"]);
  }

  deserialize(raw: string): Map<string, SerializedServer> {
    const parsed = parseExistingJson(raw, this.configPath) as {
      servers?: Record<string, SerializedServer>;
      mcpServers?: Record<string, SerializedServer>;
      mcp?: { servers?: Record<string, SerializedServer> };
    };
    return new Map(Object.entries(parsed.servers ?? parsed.mcpServers ?? parsed.mcp?.servers ?? {}));
  }

  toSerializedServer(server: McpServer): SerializedServer {
    const s = super.toSerializedServer(server);
    const type = server.transport === "stdio" ? "stdio" : server.transport === "sse" ? "sse" : "http";
    return { type, ...s };
  }
}
