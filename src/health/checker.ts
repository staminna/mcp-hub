import { spawn } from "child_process";
import { type McpServer, type HealthResult } from "../types.js";
import { loadEnvFile } from "../secrets/env-file.js";
import { resolveServer } from "../secrets/manager.js";

const TIMEOUT_MS = 10000;

async function checkStdio(server: McpServer): Promise<HealthResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    if (!server.command) {
      resolve({
        serverId: server.id,
        status: "unhealthy",
        error: "No command specified",
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    const proc = spawn(server.command, server.args ?? [], {
      cwd: server.cwd,
      env: { ...process.env, ...server.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill("SIGKILL");
        resolve({
          serverId: server.id,
          status: "unhealthy",
          error: "Timeout",
          responseTimeMs: Date.now() - start,
          checkedAt: new Date().toISOString(),
        });
      }
    }, TIMEOUT_MS);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      // Check if we got a valid JSON-RPC response
      if (stdout.includes('"jsonrpc"') && !resolved) {
        resolved = true;
        clearTimeout(timer);
        proc.kill();
        resolve({
          serverId: server.id,
          status: "healthy",
          responseTimeMs: Date.now() - start,
          checkedAt: new Date().toISOString(),
        });
      }
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          serverId: server.id,
          status: "unhealthy",
          error: err.message,
          responseTimeMs: Date.now() - start,
          checkedAt: new Date().toISOString(),
        });
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        // If process exited quickly without error, it might still be healthy
        // (some servers exit after stdin closes)
        resolve({
          serverId: server.id,
          status: code === 0 || stdout.includes('"jsonrpc"') ? "healthy" : "unhealthy",
          error: stderr || (code !== 0 ? `Exit code: ${code}` : undefined),
          responseTimeMs: Date.now() - start,
          checkedAt: new Date().toISOString(),
        });
      }
    });

    // Send MCP initialize request
    const initRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcp-hub", version: "1.0.0" },
      },
    });

    proc.stdin.write(initRequest + "\n");
    proc.stdin.end();
  });
}

async function checkHttp(server: McpServer): Promise<HealthResult> {
  const start = Date.now();

  if (!server.url) {
    return {
      serverId: server.id,
      status: "unhealthy",
      error: "No URL specified",
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(server.url, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timer);

    return {
      serverId: server.id,
      status: response.ok ? "healthy" : "unhealthy",
      responseTimeMs: Date.now() - start,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      serverId: server.id,
      status: "unhealthy",
      error: err instanceof Error ? err.message : String(err),
      responseTimeMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function checkHealth(raw: McpServer): Promise<HealthResult> {
  const { server, missing } = resolveServer(raw, await loadEnvFile());
  if (missing.length > 0) {
    return {
      serverId: raw.id,
      status: "unhealthy",
      error: `Missing in .env: ${missing.join(", ")}`,
      checkedAt: new Date().toISOString(),
    };
  }
  if (server.transport === "stdio") {
    return checkStdio(server);
  }
  return checkHttp(server);
}

export async function checkAllHealth(
  servers: McpServer[]
): Promise<HealthResult[]> {
  return Promise.all(servers.map(checkHealth));
}
