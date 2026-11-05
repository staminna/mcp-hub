import { JsonTargetAdapter, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";
import { type McpServer } from "../types.js";

/**
 * Claude Code — user-scoped servers in ~/.claude.json (top-level `mcpServers`).
 *
 * That file also holds all of Claude Code's own state (projects, history,
 * settings…). JsonTargetAdapter only replaces the `mcpServers` key and
 * refuses to write if the existing file can't be parsed.
 */
export class ClaudeCodeAdapter extends JsonTargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["claude-code"]);
  }

  /** Claude Code needs `type` for remote servers; it has no disabled/disabledTools. */
  toSerializedServer(server: McpServer): SerializedServer {
    const s = super.toSerializedServer(server);
    delete s.disabled;
    delete s.disabledTools;
    if (server.transport === "sse") return { type: "sse", ...s };
    if (server.transport === "streamable-http") return { type: "http", ...s };
    return s;
  }

  fromSerializedServer(id: string, s: SerializedServer): Partial<McpServer> {
    const server = super.fromSerializedServer(id, s);
    if (s.url && s.type === "sse") server.transport = "sse";
    return server;
  }
}
