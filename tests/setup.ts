/**
 * Runs before every test file, before any src/ module is imported.
 * Points HOME and the hub folder at a fresh temp dir so no test can ever
 * read or write the real ~/.claude.json, editor configs, mcp-hub.json or .env.
 */
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "mcp-hub-test-"));
const home = join(root, "home");
const hub = join(root, "hub");
mkdirSync(home);
mkdirSync(hub);

process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.MCP_HUB_HOME = hub;
process.env.MCP_HUB_SKILLS_DIRS = join(home, ".claude", "skills") + ":" + join(home, ".gemini", "skills");
process.env.MCP_HUB_MEMORY_DIR = join(home, ".claude", "projects");
process.env.MCP_HUB_TEST_ROOT = root;
