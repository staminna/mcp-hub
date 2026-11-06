import { Router } from "express";
import { route } from "../route.js";
import { type McpServer } from "../../types.js";
import {
  loadConfig,
  saveConfig,
  findServer,
  addServer,
  removeServer,
  slugify,
} from "../../config/store.js";
import { extractSecrets } from "../../secrets/manager.js";
import { loadEnvFile, saveEnvFile } from "../../secrets/env-file.js";

const router = Router();

// GET /api/servers
router.get("/", route(async (_req, res) => {
  const config = await loadConfig();
  res.json(config.servers);
}));

// GET /api/servers/:id
router.get("/:id", route(async (req, res) => {
  const config = await loadConfig();
  const server = findServer(config, req.params.id);
  if (!server) return res.status(404).json({ error: "Not found" });
  res.json(server);
}));

// POST /api/servers
router.post("/", route(async (req, res) => {
  const config = await loadConfig();
  const body = req.body as Partial<McpServer>;

  if (!body.name) return res.status(400).json({ error: "name required" });

  const server: McpServer = {
    id: body.id ?? slugify(body.name),
    name: body.name,
    description: body.description,
    transport: body.transport ?? "stdio",
    command: body.command,
    args: body.args,
    cwd: body.cwd,
    url: body.url,
    env: body.env,
    tags: body.tags ?? [],
    disabled: body.disabled ?? false,
    disabledTools: body.disabledTools,
    targets: body.targets ?? "*",
  };

  // A pasted config often carries a literal token: keep it out of mcp-hub.json
  // (it's committed) by moving it to .env and leaving a ${VAR} behind, like import does
  const { config: clean, extracted } = extractSecrets({ ...config, servers: [server] });
  if (Object.keys(extracted).length > 0) {
    await saveEnvFile({ ...(await loadEnvFile()), ...extracted });
  }
  const saved = clean.servers[0];
  await saveConfig(addServer(config, saved));
  res.status(201).json(saved);
}));

// PUT /api/servers/:id
router.put("/:id", route(async (req, res) => {
  const config = await loadConfig();
  const existing = findServer(config, req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  // Replace, not merge: a field left out of the body is removed (e.g. a cleared cwd)
  const body = req.body as Partial<McpServer>;
  if (!body.name) return res.status(400).json({ error: "name required" });
  const updated: McpServer = {
    tags: [],
    disabled: false,
    targets: "*",
    transport: "stdio",
    ...body,
    name: body.name,
    id: req.params.id,
  };
  const newConfig = addServer(config, updated);
  await saveConfig(newConfig);
  res.json(updated);
}));

// DELETE /api/servers/:id
router.delete("/:id", route(async (req, res) => {
  const config = await loadConfig();
  const existing = findServer(config, req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const updated = removeServer(config, req.params.id);
  await saveConfig(updated);
  res.status(204).send();
}));

// POST /api/servers/:id/toggle
router.post("/:id/toggle", route(async (req, res) => {
  const config = await loadConfig();
  const server = findServer(config, req.params.id);
  if (!server) return res.status(404).json({ error: "Not found" });

  server.disabled = !server.disabled;
  await saveConfig(config);
  res.json(server);
}));

// POST /api/servers/:id/health
router.post("/:id/health", route(async (req, res) => {
  const config = await loadConfig();
  const server = findServer(config, req.params.id);
  if (!server) return res.status(404).json({ error: "Not found" });

  const { checkHealth } = await import("../../health/checker.js");
  const result = await checkHealth(server);
  res.json(result);
}));

export default router;
