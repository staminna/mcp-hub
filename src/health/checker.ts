import { spawn } from "child_process";
import { type McpServer, type HealthResult } from "../types.js";
import { loadEnvFile } from "../secrets/env-file.js";
import { resolveServer } from "../secrets/manager.js";

const TIMEOUT_MS = 10000;

// The MCP initialize request: every server must answer it, over stdio or HTTP
const INIT_REQUEST = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-hub", version: "1.0.0" },
  },
});

async function checkStdio(server: McpServer, timeoutMs: number): Promise<HealthResult> {
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
    }, timeoutMs);

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

    // A server that exits before reading stdin gives EPIPE; "close" reports the result
    proc.stdin.on("error", () => {});
    proc.stdin.write(INIT_REQUEST + "\n");
    proc.stdin.end();
  });
}

async function checkHttp(server: McpServer, timeoutMs: number): Promise<HealthResult> {
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
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Streamable-HTTP servers only have to accept POST (HEAD/GET often give 405),
    // so probe with a real initialize call
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: INIT_REQUEST,
      signal: controller.signal,
    });

    clearTimeout(timer);
    // Don't wait on the body: an SSE reply can stay open until the timeout
    await response.body?.cancel().catch(() => {});

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

export async function checkHealth(
  raw: McpServer,
  { timeoutMs = TIMEOUT_MS, envFile }: { timeoutMs?: number; envFile?: Record<string, string> } = {}
): Promise<HealthResult> {
  const { server, missing } = resolveServer(raw, envFile ?? (await loadEnvFile()));
  if (missing.length > 0) {
    return {
      serverId: raw.id,
      status: "unhealthy",
      error: `Missing in .env: ${missing.join(", ")}`,
      checkedAt: new Date().toISOString(),
    };
  }
  if (server.transport === "stdio") {
    return checkStdio(server, timeoutMs);
  }
  return checkHttp(server, timeoutMs);
}

export async function checkAllHealth(
  servers: McpServer[]
): Promise<HealthResult[]> {
  return Promise.all(servers.map((s) => checkHealth(s)));
}
