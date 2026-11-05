import { JsonTargetAdapter } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

/** Unity MCP — ~/.unity-mcp/config.json. */
export class UnityAdapter extends JsonTargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["unity"]);
  }
}
