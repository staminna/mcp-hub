import { Router } from "express";
import { route } from "../route.js";
import { loadConfig } from "../../config/store.js";
import { syncAll, getServersForTarget } from "../../sync/engine.js";
import { getTargetNames, getAdapter } from "../../targets/registry.js";

const router = Router();

// POST /api/sync/all
router.post("/all", route(async (_req, res) => {
  const config = await loadConfig();
  const results = await syncAll(config);
  res.json(results);
}));

// GET /api/sync/diff
router.get("/diff", route(async (_req, res) => {
  const config = await loadConfig();
  const targets = getTargetNames();
  const targetDiffs: Array<{ name: string; label: string; hasChanges: boolean; before: string; after: string; error?: string }> = [];

  for (const targetName of targets) {
    const adapter = getAdapter(targetName);
    const { servers } = await getServersForTarget(config, targetName);

    let current: Map<string, unknown>;
    try {
      current = await adapter.read();
    } catch (err) {
      // Unreadable config: sync would refuse it too, so say so instead of diffing against {}
      targetDiffs.push({
        name: targetName,
        label: adapter.config.displayName,
        hasChanges: false,
        before: "",
        after: "",
        error: (err as Error).message,
      });
      continue;
    }
    const before = Object.fromEntries(current);
    // Sync is non-destructive: start from what's already there
    const after: Record<string, unknown> = { ...before };
    for (const s of servers) after[s.id] = adapter.toSerializedServer(s);
    const beforeStr = JSON.stringify({ mcpServers: before }, null, 2);
    const afterStr = JSON.stringify({ mcpServers: after }, null, 2);

    targetDiffs.push({
      name: targetName,
      label: adapter.config.displayName,
      hasChanges: beforeStr !== afterStr,
      before: beforeStr,
      after: afterStr,
    });
  }

  res.json({ targets: targetDiffs });
}));

export default router;
