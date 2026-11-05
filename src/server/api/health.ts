import { Router } from "express";
import { route } from "../route.js";
import { loadConfig } from "../../config/store.js";
import { checkAllHealth } from "../../health/checker.js";

const router = Router();

// GET /api/health
router.get("/", route(async (_req, res) => {
  const config = await loadConfig();
  const servers = config.servers.filter((s) => !s.disabled);
  const results = await checkAllHealth(servers);
  res.json(results);
}));

export default router;
