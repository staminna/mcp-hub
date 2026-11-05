import { describe, it, expect } from "vitest";
import { formatHealthResults } from "../src/health/reporter.js";
import { type HealthResult } from "../src/types.js";

describe("health reporter", () => {
  it("formats healthy results", () => {
    const results: HealthResult[] = [
      {
        serverId: "test-server",
        status: "healthy",
        responseTimeMs: 42,
        checkedAt: "2024-01-01T00:00:00Z",
      },
    ];
    const output = formatHealthResults(results);
    expect(output).toContain("✓");
    expect(output).toContain("test-server");
    expect(output).toContain("42ms");
    expect(output).toContain("1/1 healthy");
  });

  it("formats unhealthy results", () => {
    const results: HealthResult[] = [
      {
        serverId: "broken",
        status: "unhealthy",
        error: "Connection refused",
        checkedAt: "2024-01-01T00:00:00Z",
      },
    ];
    const output = formatHealthResults(results);
    expect(output).toContain("✗");
    expect(output).toContain("Connection refused");
    expect(output).toContain("0/1 healthy");
  });

  it("formats mixed results", () => {
    const results: HealthResult[] = [
      { serverId: "a", status: "healthy", responseTimeMs: 10, checkedAt: "" },
      { serverId: "b", status: "unhealthy", error: "timeout", checkedAt: "" },
      { serverId: "c", status: "healthy", responseTimeMs: 20, checkedAt: "" },
    ];
    const output = formatHealthResults(results);
    expect(output).toContain("2/3 healthy");
  });
});

import { createServer, type Server } from "http";
import { afterAll, beforeAll } from "vitest";
import { checkHealth, checkAllHealth } from "../src/health/checker.js";
import { server as mk } from "./helpers.js";

const node = process.execPath;
const stdio = (script: string, over = {}) => mk({ command: node, args: ["-e", script], ...over });

describe("health checker: stdio", () => {
  it("is healthy when the server answers JSON-RPC", async () => {
    const r = await checkHealth(stdio(`process.stdin.once("data",()=>{process.stdout.write('{"jsonrpc":"2.0","id":1,"result":{}}\\n');setInterval(()=>{},1000)})`));
    expect(r.status).toBe("healthy");
    expect(r.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("is healthy when it exits cleanly", async () => {
    expect((await checkHealth(stdio("process.exit(0)"))).status).toBe("healthy");
  });

  it("is unhealthy with stderr when it fails", async () => {
    const r = await checkHealth(stdio("console.error('boom'); process.exit(3)"));
    expect(r).toMatchObject({ status: "unhealthy" });
    expect(r.error).toContain("boom");
  });

  it("reports the exit code when there's no stderr", async () => {
    const r = await checkHealth(stdio("process.exit(4)"));
    expect(r.error).toBe("Exit code: 4");
  });

  it("is unhealthy when the command doesn't exist", async () => {
    const r = await checkHealth(mk({ command: "/definitely/not/here" }));
    expect(r.status).toBe("unhealthy");
    expect(r.error).toMatch(/ENOENT/);
  });

  it("is unhealthy without a command", async () => {
    expect((await checkHealth(mk({ command: undefined }))).error).toBe("No command specified");
  });

  it("times out a server that never answers", async () => {
    const r = await checkHealth(stdio("setInterval(()=>{},1000)"), { timeoutMs: 300 });
    expect(r).toMatchObject({ status: "unhealthy", error: "Timeout" });
  });

  it("passes resolved env vars to the process", async () => {
    const r = await checkHealth(
      stdio("process.exit(process.env.TOKEN==='real'?0:9)", { env: { TOKEN: "${HEALTH_TOKEN}" } }),
      { envFile: { HEALTH_TOKEN: "real" } },
    );
    expect(r.status).toBe("healthy");
  });

  it("doesn't start a server whose vars are missing", async () => {
    const r = await checkHealth(stdio("process.exit(0)", { env: { T: "${NOT_IN_ENV_EVER}" } }), { envFile: {} });
    expect(r).toMatchObject({ status: "unhealthy", error: "Missing in .env: NOT_IN_ENV_EVER" });
  });

  it("reads .env itself when none is passed", async () => {
    const r = await checkHealth(stdio("process.exit(0)"));
    expect(r.status).toBe("healthy");
  });
});

describe("health checker: http", () => {
  let srv: Server;
  let base = "";
  beforeAll(async () => {
    srv = createServer((req, res) => {
      if (req.url === "/slow") return; // never answers
      res.statusCode = req.url === "/ok" ? 200 : 500;
      res.end();
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const a = srv.address();
    base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  });
  afterAll(() => { srv.closeAllConnections(); srv.close(); });

  const http = (url?: string) => mk({ transport: "streamable-http", command: undefined, url });

  it("is healthy on 2xx", async () => {
    expect((await checkHealth(http(`${base}/ok`))).status).toBe("healthy");
  });
  it("is unhealthy on an error status", async () => {
    expect(await checkHealth(http(`${base}/bad`))).toMatchObject({ status: "unhealthy", error: "HTTP 500" });
  });
  it("is unhealthy when nothing listens", async () => {
    expect((await checkHealth(http("http://127.0.0.1:1/"))).status).toBe("unhealthy");
  });
  it("times out", async () => {
    expect((await checkHealth(http(`${base}/slow`), { timeoutMs: 200 })).status).toBe("unhealthy");
  });
  it("is unhealthy without a URL", async () => {
    expect((await checkHealth(http())).error).toBe("No URL specified");
  });
  it("reports non-Error failures as strings", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject("plain")) as typeof fetch;
    try {
      expect((await checkHealth(http(`${base}/ok`))).error).toBe("plain");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("checkAllHealth checks every server", async () => {
    const rs = await checkAllHealth([http(`${base}/ok`), stdio("process.exit(0)")]);
    expect(rs.map((r) => r.status)).toEqual(["healthy", "healthy"]);
  });
});
