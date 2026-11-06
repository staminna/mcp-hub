import { Router } from "express";
import { homedir } from "os";
import { route } from "../route.js";
import { type TargetName } from "../../types.js";
import { loadConfig, saveConfig, setTargetEnabled } from "../../config/store.js";
import { getAllAdapters, getAdapter, isTargetName, isTargetEnabled } from "../../targets/registry.js";
import { syncTarget } from "../../sync/engine.js";
import { sameServer, type TargetAdapter } from "../../targets/base.js";
import { type HubConfig } from "../../types.js";

const TARGET_ICONS: Record<TargetName, string> = {
  "claude-code": "✳️",
  "claude-mcp": "🤖",
  "claude-desktop": "🖥️",
  "claude-settings": "⚙️",
  vscode: "💎",
  windsurf: "🌊",
  cursor: "⌨️",
  gemini: "♊",
  docker: "🐳",
  unity: "🎮",
};

/** Hub server ids found in an editor's config (ids only — never values). Unreadable config → none. */
async function presentIn(adapter: TargetAdapter, config: HubConfig): Promise<string[]> {
  const keys = [...(await adapter.read().catch(() => new Map())).keys()];
  return config.servers.filter((s) => keys.some((k) => sameServer(k, s.id))).map((s) => s.id);
}

const router = Router();

// GET /api/targets
router.get("/", route(async (_req, res) => {
  const config = await loadConfig();
  const adapters = getAllAdapters();
  const targets = await Promise.all(adapters.map(async (a) => ({
    name: a.name,
    label: a.config.displayName,
    icon: TARGET_ICONS[a.name],
    path: a.configPath.replace(homedir(), "~"),
    exists: a.exists(),
    enabled: isTargetEnabled(config, a.name),
    present: await presentIn(a, config),
  })));
  res.json(targets);
}));

// PUT /api/targets/:name  { enabled: boolean } — turn an editor on/off for sync
router.put("/:name", route(async (req, res) => {
  const name = req.params.name;
  if (!isTargetName(name)) return res.status(400).json({ error: `Unknown target: ${name}` });
  if (typeof req.body.enabled !== "boolean") return res.status(400).json({ error: "enabled must be true or false" });
  const config = setTargetEnabled(await loadConfig(), name, req.body.enabled);
  await saveConfig(config);
  res.json({ name, enabled: isTargetEnabled(config, name) });
}));

// POST /api/targets/:name/sync
router.post("/:name/sync", route(async (req, res) => {
  const config = await loadConfig();
  const target = req.params.name as TargetName;

  try {
    getAdapter(target); // validate
  } catch {
    return res.status(400).json({ error: `Unknown target: ${target}` });
  }

  const result = await syncTarget(config, target);
  res.json(result);
}));

export default router;
