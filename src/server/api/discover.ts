import { Router } from "express";
import { route } from "../route.js";
import { searchNpm } from "../../discovery/npm.js";
import { findRunningMcpProcesses } from "../../discovery/process.js";
import { searchRegistry } from "../../discovery/registry.js";

const router = Router();

// GET /api/discover/npm
router.get("/npm", route(async (req, res) => {
  const query = (req.query.q as string) ?? "mcp-server";
  const results = await searchNpm(query);
  res.json(results);
}));

// GET /api/discover/running
router.get("/running", route(async (_req, res) => {
  const results = await findRunningMcpProcesses();
  res.json(results);
}));

// GET /api/discover/registry
router.get("/registry", route(async (req, res) => {
  const query = req.query.q as string | undefined;
  const results = searchRegistry(query);
  res.json(results);
}));

export default router;
