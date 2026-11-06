import { Router } from "express";
import { route } from "../route.js";
import { loadConfig } from "../../config/store.js";
import { loadEnvFile, saveEnvFile } from "../../secrets/env-file.js";
import { listSecretVars, VAR_NAME } from "../../secrets/manager.js";

/**
 * The .env file, write-only: names and status go out, values only come in.
 * A saved value is never sent back to the browser.
 */
const router = Router();

// GET /api/secrets
router.get("/", route(async (_req, res) => {
  res.json(listSecretVars(await loadConfig(), await loadEnvFile()));
}));

// PUT /api/secrets/:name  { value }
router.put("/:name", route(async (req, res) => {
  const { name } = req.params;
  const value = req.body.value; // express.json() always sets an object
  if (!VAR_NAME.test(name)) {
    return res.status(400).json({ error: "Use letters, digits and _ only, not starting with a digit" });
  }
  if (typeof value !== "string" || !value.trim()) {
    return res.status(400).json({ error: "Enter a value" });
  }
  if (/[\r\n]/.test(value)) {
    return res.status(400).json({ error: "A value can't contain line breaks" });
  }
  await saveEnvFile({ ...(await loadEnvFile()), [name]: value.trim() });
  res.json({ name, source: "env-file" });
}));

// DELETE /api/secrets/:name
router.delete("/:name", route(async (req, res) => {
  const env = await loadEnvFile();
  if (!(req.params.name in env)) return res.status(404).json({ error: "Not in .env" });
  delete env[req.params.name];
  await saveEnvFile(env);
  res.status(204).send();
}));

export default router;
