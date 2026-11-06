import { describe, it, expect } from "vitest";
import { parsePastedServers } from "./pasteConfig.ts";

describe("parsePastedServers", () => {
  it("reads a bare entry copied from an editor config", () => {
    const text = `   "arkestra": {
     "command": "npx",
     "args": ["-y", "mcp-remote", "http://localhost:9315/mcp"]
   },`;
    expect(parsePastedServers(text)).toEqual([
      { name: "arkestra", transport: "stdio", command: "npx", args: ["-y", "mcp-remote", "http://localhost:9315/mcp"], targets: "*" },
    ]);
  });

  it("reads a whole mcpServers file, VS Code servers and nested mcp.servers", () => {
    const file = `{ "mcpServers": {
      "a": { "command": "node", "args": ["s.js"], "cwd": "/x", "env": { "N": 1 }, "disabled": true },
      "b": { "url": "https://b/mcp" },
      "c": { "type": "sse", "url": "https://c/sse" },
    } }`;
    const [a, b, c] = parsePastedServers(file);
    expect(a).toMatchObject({ name: "a", cwd: "/x", env: { N: "1" }, disabled: true });
    expect(b).toMatchObject({ name: "b", transport: "streamable-http", url: "https://b/mcp" });
    expect(c).toMatchObject({ name: "c", transport: "sse" });
    expect(parsePastedServers(`{"servers": {"v": {"serverUrl": "https://v"}}}`)[0]).toMatchObject({ name: "v", url: "https://v" });
    expect(parsePastedServers(`{"mcp": {"servers": {"g": {"httpUrl": "https://g", "transport": "sse"}}}}`)[0]).toMatchObject({ transport: "sse" });
    expect(parsePastedServers(`{"x": {"command": "npx", "args": "not-a-list"}}`)[0].args).toBeUndefined();
  });

  it("reads one unnamed server, leaving the name for the form", () => {
    expect(parsePastedServers(`{"url": "https://u"}`)).toEqual([{ name: "", transport: "streamable-http", url: "https://u", targets: "*" }]);
  });

  it("explains what's wrong", () => {
    expect(() => parsePastedServers("  ")).toThrow("Paste a server config first.");
    expect(() => parsePastedServers(`"a": {`)).toThrow(/isn't valid JSON/);
    expect(() => parsePastedServers(`[1]`)).toThrow("Expected a JSON object.");
    expect(() => parsePastedServers(`{"a": 1}`)).toThrow("No servers found");
    expect(() => parsePastedServers(`{"a": {"foo": 1}}`)).toThrow(`"a" has neither a command nor a url.`);
  });
});
