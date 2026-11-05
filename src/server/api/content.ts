import { Router } from "express";
import {
  listSkills,
  listMemories,
  readMarkdown,
  writeMarkdown,
  parseMarkdown,
} from "../../content/markdown.js";

/** Router for a markdown collection: GET / (list), GET /file, PUT /file */
function contentRouter(list: () => Promise<unknown[]>): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await list());
  });

  router.get("/file", async (req, res) => {
    try {
      const content = await readMarkdown(String(req.query.path ?? ""));
      res.json({ content, ...parseMarkdown(content) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.put("/file", async (req, res) => {
    const { path, content } = req.body ?? {};
    if (typeof path !== "string" || typeof content !== "string") {
      return res.status(400).json({ error: "path and content required" });
    }
    try {
      await writeMarkdown(path, content);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}

export const skillsRouter = contentRouter(listSkills);
export const memoriesRouter = contentRouter(listMemories);
