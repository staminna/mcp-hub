import express from "express";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import serversRouter from "./api/servers.js";
import syncRouter from "./api/sync.js";
import targetsRouter from "./api/targets.js";
import healthRouter from "./api/health.js";
import discoverRouter from "./api/discover.js";
import { skillsRouter, memoriesRouter } from "./api/content.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The built dashboard (web/ → dist/web). Works from src/server (tsx) and dist/server.
const webDir = [
  join(__dirname, "..", "..", "dist", "web"), // from src/server/
  join(__dirname, "..", "web"), // from dist/server/
].find((d) => existsSync(join(d, "index.html")));

export function createServer(): express.Express {
  const app = express();

  app.use(express.json());

  // API routes
  app.use("/api/servers", serversRouter);
  app.use("/api/sync", syncRouter);
  app.use("/api/targets", targetsRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/discover", discoverRouter);
  app.use("/api/skills", skillsRouter);
  app.use("/api/memories", memoriesRouter);

  // Import endpoint
  app.post("/api/import/:ide", async (req, res) => {
    const { importCommand } = await import("../cli/commands/import.js");
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    await importCommand({ from: req.params.ide });
    console.log = origLog;
    res.json({ logs });
  });

  // Serve dashboard
  if (webDir) {
    app.use(express.static(webDir));
  } else {
    app.get("/", (_req, res) => {
      res
        .type("html")
        .send(
          "<p style='font-family:system-ui'>The dashboard isn't built yet. Run <code>npm run build</code>, " +
            "or <code>npm run dev:web</code> and open http://localhost:5173.</p>"
        );
    });
  }

  return app;
}
