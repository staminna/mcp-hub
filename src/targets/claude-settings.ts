import { JsonTargetAdapter } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

/** Claude — ~/.claude/settings.local.json (also holds permissions etc., all kept). */
export class ClaudeSettingsAdapter extends JsonTargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["claude-settings"]);
  }
}
