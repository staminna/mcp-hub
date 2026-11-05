import { JsonTargetAdapter } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

/** Cursor — ~/.cursor/mcp.json. */
export class CursorAdapter extends JsonTargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["cursor"]);
  }
}
