import { Router } from "express";
import { type TargetName } from "../../types.js";
import { loadConfig } from "../../config/store.js";
import { getAllAdapters, getAdapter } from "../../targets/registry.js";
import { syncTarget } from "../../sync/engine.js";

const TARGET_ICONS: Record<string, string> = {
  "claude-code": "✳️",
  "claude-mcp": "🤖",
  "claude-settings": "⚙️",
  vscode: "💎",
  windsurf: "🌊",
  cursor: "⌨️",
  gemini: "♊",
  docker: "🐳",
  unity: "🎮",
};

const router = Router();

// GET /api/targets
router.get("/", async (_req, res) => {
  const adapters = getAllAdapters();
  const targets = adapters.map((a) => ({
    name: a.name,
    label: a.config.displayName,
    icon: TARGET_ICONS[a.name] ?? "📦",
    path: a.configPath.replace(process.env.HOME ?? "", "~"),
    exists: a.exists(),
  }));
  res.json(targets);
});

// POST /api/targets/:name/sync
router.post("/:name/sync", async (req, res) => {
  const config = await loadConfig();
  const target = req.params.name as TargetName;

  try {
    getAdapter(target); // validate
  } catch {
    return res.status(400).json({ error: `Unknown target: ${target}` });
  }

  const result = await syncTarget(config, target);
  res.json(result);
});

export default router;
