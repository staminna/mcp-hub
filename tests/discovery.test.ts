import { describe, it, expect, vi, afterEach } from "vitest";

const execMock = vi.hoisted(() => vi.fn());
vi.mock("child_process", async (orig) => ({ ...(await orig<typeof import("child_process")>()), exec: execMock }));

import { searchNpm } from "../src/discovery/npm.js";
import { findRunningMcpProcesses, redact } from "../src/discovery/process.js";
import { searchRegistry, POPULAR_SERVERS } from "../src/discovery/registry.js";

afterEach(() => { vi.unstubAllGlobals(); execMock.mockReset(); });

describe("searchNpm", () => {
  it("maps npm search results", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ objects: [{ package: { name: "a-mcp", description: "A" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchNpm("my query")).toEqual([
      { name: "a-mcp", source: "npm", description: "A", command: "npx", installCommand: "npm install -g a-mcp" },
    ]);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("text=my%20query");
  });
  it("uses a default query", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ objects: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await searchNpm();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("text=mcp-server");
  });
  it("returns [] on an HTTP error or network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await searchNpm("x")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await searchNpm("x")).toEqual([]);
  });
});

describe("findRunningMcpProcesses", () => {
  const ps = (lines: string[]) =>
    execMock.mockImplementation((_cmd: string, cb: (e: Error | null, r: { stdout: string; stderr: string }) => void) =>
      cb(null, { stdout: lines.join("\n"), stderr: "" }));
  const row = (cmd: string) => `me 123 0.0 0.1 1 2 ?? S 10:00 0:00.01 ${cmd}`;

  it("lists MCP processes but not the hub or grep", async () => {
    ps([
      "USER PID ...",
      row("node /opt/servers/fs-mcp/index.js"),
      row("node mcp-hub serve"),
      row("grep mcp"),
      "me 1 2 3 4 5 6 7 8 mcp", // too few columns: no command
      row("bash"),
    ]);
    const rs = await findRunningMcpProcesses();
    expect(rs).toEqual([{
      name: "index.js",
      source: "process",
      description: "Running process: node /opt/servers/fs-mcp/index.js",
      command: "node",
    }]);
  });

  it("hides secrets in command lines", async () => {
    ps([row("npx stripe-mcp --api-key=sk_test_123 --tools=all")]);
    const [r] = await findRunningMcpProcesses();
    expect(r.description).toContain("--api-key=•••");
    expect(r.description).not.toContain("sk_test_123");
  });

  it("returns [] when ps fails", async () => {
    execMock.mockImplementation((_c: string, cb: (e: Error) => void) => cb(new Error("no ps")));
    expect(await findRunningMcpProcesses()).toEqual([]);
  });

  it("uses an empty name for a bare path", async () => {
    ps([row("/ mcp")]);
    const [r] = await findRunningMcpProcesses();
    expect(r.name).toBe("");
  });
});

describe("redact", () => {
  it("hides flag values, KEY=value pairs and long tokens", () => {
    expect(redact("x --token abc --api-key=def")).toBe("x --token ••• --api-key=•••");
    expect(redact("GITHUB_TOKEN=ghp_x node s.js")).toBe("GITHUB_TOKEN=••• node s.js");
    expect(redact('--password "a b"')).toBe("--password •••");
    expect(redact("node s.js " + "a".repeat(40))).toBe("node s.js •••");
    expect(redact("node /srv/fs/index.js --port 3")).toBe("node /srv/fs/index.js --port 3");
  });
});

describe("searchRegistry", () => {
  it("returns everything without a query, and filters by name or description", () => {
    expect(searchRegistry()).toBe(POPULAR_SERVERS);
    expect(searchRegistry("GITHUB").map((s) => s.name)).toEqual(["@modelcontextprotocol/server-github"]);
    expect(searchRegistry("postgresql database").length).toBe(1);
    expect(searchRegistry("zzz-none")).toEqual([]);
  });
});
