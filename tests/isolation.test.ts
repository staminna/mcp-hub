import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { TARGET_CONFIGS, HUB_CONFIG_PATH, HUB_ENV_PATH, HUB_HOME, DEFAULT_HUB_SETTINGS } from "../src/config/defaults.js";
import { skillDirs, memoryRoot } from "../src/content/markdown.js";

// If this fails, other tests could write to your real configs. It must pass first.
describe("test isolation", () => {
  const root = process.env.MCP_HUB_TEST_ROOT!;
  it("runs inside a temp root", () => {
    expect(root).toMatch(/mcp-hub-test-/);
    expect(homedir().startsWith(root)).toBe(true);
  });
  it("every path the app writes is inside the temp root", () => {
    const paths = [
      ...Object.values(TARGET_CONFIGS).map((t) => t.configPath),
      HUB_CONFIG_PATH,
      HUB_ENV_PATH,
      HUB_HOME,
      DEFAULT_HUB_SETTINGS.backupDir,
      ...skillDirs(),
      memoryRoot(),
    ];
    for (const p of paths) expect(p.startsWith(root), p).toBe(true);
  });
});
