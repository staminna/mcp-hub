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

// Resolve web dashboard path — works from both src/ (tsx) and dist/ (compiled)
function findDashboard(): string {
  const candidates = [
    join(__dirname, "..", "web", "index.html"),        // from src/server/
    join(__dirname, "..", "..", "src", "web", "index.html"), // from dist/server/
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

const dashboardPath = findDashboard();

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
  app.get("/", (_req, res) => {
    res.sendFile(dashboardPath);
  });

  app.get("/dashboard", (_req, res) => {
    res.sendFile(dashboardPath);
  });

  return app;
}
