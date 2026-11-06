import { JsonTargetAdapter, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";
import { type McpServer } from "../types.js";

const BRIDGE = ["-y", "mcp-remote"];

/**
 * Claude Desktop — ~/Library/Application Support/Claude/claude_desktop_config.json.
 *
 * That file only takes stdio servers (remote ones are added as connectors in the app),
 * so a hub HTTP/SSE server is written as `npx -y mcp-remote <url>`, the usual bridge.
 * It's read back as the URL server, so sync doesn't see a change every time.
 * Other keys (preferences…) are left alone: JsonTargetAdapter only replaces mcpServers.
 */
export class ClaudeDesktopAdapter extends JsonTargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["claude-desktop"]);
  }

  toSerializedServer(server: McpServer): SerializedServer {
    const s = super.toSerializedServer(server);
    delete s.disabled; // Desktop has no per-server switches
    delete s.disabledTools;
    if (server.transport === "stdio" || !s.url) return s;
    const { url, ...rest } = s;
    return { command: "npx", args: [...BRIDGE, url], ...rest };
  }

  fromSerializedServer(id: string, s: SerializedServer): Partial<McpServer> {
    const a = s.args ?? [];
    const bridged = s.command === "npx" && a.length === 3 && a[0] === BRIDGE[0] && a[1] === BRIDGE[1];
    if (!bridged) return super.fromSerializedServer(id, s);
    const { command: _c, args: _a, ...rest } = s;
    return super.fromSerializedServer(id, { ...rest, url: a[2] });
  }
}
