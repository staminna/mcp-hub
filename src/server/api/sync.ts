import { Router } from "express";
import { route } from "../route.js";
import { loadConfig } from "../../config/store.js";
import { syncAll, getServersForTarget } from "../../sync/engine.js";
import { getEnabledTargetNames, getAdapter } from "../../targets/registry.js";
import { computeDiff, changedFields } from "../../sync/diff.js";

const router = Router();

// POST /api/sync/all
router.post("/all", route(async (_req, res) => {
  const config = await loadConfig();
  const results = await syncAll(config);
  res.json(results);
}));

/**
 * GET /api/sync/diff — what a sync would change, per editor. Only server ids
 * and field names are sent: the configs hold real tokens, which never leave
 * the hub process.
 */
router.get("/diff", route(async (_req, res) => {
  const config = await loadConfig();
  const targets = [];

  for (const name of getEnabledTargetNames(config)) {
    const adapter = getAdapter(name);
    const label = adapter.config.displayName;
    const { servers } = await getServersForTarget(config, name);
    try {
      const servers_ = (await computeDiff(name, servers))
        .filter((d) => d.action === "add" || d.action === "update")
        .map((d) => ({
          id: d.serverId,
          action: d.action as "add" | "update",
          fields: d.action === "update" ? changedFields(d.before!, d.after!) : [],
        }));
      targets.push({ name, label, hasChanges: servers_.length > 0, servers: servers_ });
    } catch (err) {
      // Unreadable config: sync would refuse it too
      targets.push({ name, label, hasChanges: false, servers: [], error: (err as Error).message });
    }
  }

  res.json({ targets });
}));

export default router;
