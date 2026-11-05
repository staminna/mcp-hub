import { JsonTargetAdapter } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

/** Gemini CLI — ~/.gemini/settings.json (ide, security, ui… all kept). */
export class GeminiAdapter extends JsonTargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["gemini"]);
  }
}
