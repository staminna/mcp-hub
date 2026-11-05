import { JsonTargetAdapter } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

/** Claude Desktop — ~/.claude/mcp_config.json. */
export class ClaudeMcpAdapter extends JsonTargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["claude-mcp"]);
  }
}
