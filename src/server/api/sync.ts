import { Router } from "express";
import { type TargetName } from "../../types.js";
import { loadConfig } from "../../config/store.js";
import { syncTarget, syncAll, getServersForTarget } from "../../sync/engine.js";
import { computeDiff } from "../../sync/diff.js";
import { getTargetNames } from "../../targets/registry.js";

const router = Router();

// POST /api/sync/all
router.post("/all", async (_req, res) => {
  const config = await loadConfig();
  const results = await syncAll(config);
  res.json(results);
});

// GET /api/sync/diff
router.get("/diff", async (_req, res) => {
  const config = await loadConfig();
  const targets = getTargetNames();
  const { getAdapter } = await import("../../targets/registry.js");

  const targetDiffs = [];

  for (const targetName of targets) {
    const adapter = getAdapter(targetName);
    const { servers } = await getServersForTarget(config, targetName);

    // Get current config as string
    let beforeStr = "";
    try {
      const currentServers = await adapter.read();
      const currentObj: Record<string, unknown> = {};
      for (const [id, s] of currentServers) currentObj[id] = s;
      beforeStr = JSON.stringify({ mcpServers: currentObj }, null, 2);
    } catch {
      beforeStr = "{}";
    }

    // Get desired config as string
    // Sync is non-destructive: start from what's already there
    let desiredObj: Record<string, unknown> = {};
    try {
      desiredObj = JSON.parse(beforeStr).mcpServers ?? {};
    } catch {}
    for (const s of servers) {
      desiredObj[s.id] = adapter.toSerializedServer(s);
    }
    const afterStr = JSON.stringify({ mcpServers: desiredObj }, null, 2);

    targetDiffs.push({
      name: targetName,
      label: adapter.config.displayName,
      hasChanges: beforeStr !== afterStr,
      before: beforeStr,
      after: afterStr,
    });
  }

  res.json({ targets: targetDiffs });
});

export default router;
