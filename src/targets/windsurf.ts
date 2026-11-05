import { JsonTargetAdapter } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

/** Windsurf — supports disabled and disabledTools. */
export class WindsurfAdapter extends JsonTargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["windsurf"]);
  }
}
