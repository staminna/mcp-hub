import { describe, it, expect, beforeEach } from "vitest";
import { getAdapter, getAllAdapters, getTargetNames } from "../../src/targets/registry.js";
import { parseExistingJson } from "../../src/targets/base.js";
import { type TargetName } from "../../src/types.js";
import { server, write, read, readJson, remove } from "../helpers.js";

const JSON_TARGETS: TargetName[] = [
  "claude-code", "claude-mcp", "claude-settings", "windsurf", "cursor", "gemini", "unity",
];

describe("registry", () => {
  it("knows every target", () => {
    expect(getTargetNames()).toHaveLength(10);
    expect(getAllAdapters().map((a) => a.name)).toEqual(getTargetNames());
  });
  it("rejects unknown targets", () => {
    expect(() => getAdapter("nope" as TargetName)).toThrow("Unknown target: nope");
  });
});

describe("parseExistingJson", () => {
  it("treats an empty file as {}", () => {
    expect(parseExistingJson("  \n", "f")).toEqual({});
  });
  it("refuses invalid JSON and non-objects", () => {
    expect(() => parseExistingJson("{ nope", "f.json")).toThrow("f.json isn't valid JSON");
    expect(() => parseExistingJson("[]", "f.json")).toThrow("isn't a JSON object");
    expect(() => parseExistingJson("null", "f.json")).toThrow("isn't a JSON object");
  });
});

describe.each(JSON_TARGETS)("%s adapter (JSON, mcpServers)", (name) => {
  const adapter = getAdapter(name);
  beforeEach(() => remove(adapter.configPath));

  it("reads nothing when the file is missing", async () => {
    expect(adapter.exists()).toBe(false);
    expect(await adapter.readRaw()).toBe("");
    expect((await adapter.read()).size).toBe(0);
  });

  it("merges hub servers and keeps every other key and server", async () => {
    write(adapter.configPath, {
      permissions: { allow: ["Bash"] },
      disabledMcpjsonServers: ["x"],
      somethingNew: 1,
      mcpServers: { theirs: { command: "keep-me" } },
    });
    await adapter.merge([server({ id: "ours" })]);
    const out = readJson(adapter.configPath);
    expect(out.permissions).toEqual({ allow: ["Bash"] });
    expect(out.disabledMcpjsonServers).toEqual(["x"]);
    expect(out.somethingNew).toBe(1);
    expect(out.mcpServers.theirs).toEqual({ command: "keep-me" });
    expect(out.mcpServers.ours.command).toBe("node");
    expect([...(await adapter.read()).keys()].sort()).toEqual(["ours", "theirs"]);
  });

  it("creates the file (and folder) when missing", async () => {
    await adapter.merge([server()]);
    expect(Object.keys(readJson(adapter.configPath))).toEqual(["mcpServers"]);
  });

  it("refuses to overwrite a file it can't parse", async () => {
    write(adapter.configPath, "{ broken");
    await expect(adapter.merge([server()])).rejects.toThrow("isn't valid JSON");
    expect(read(adapter.configPath)).toBe("{ broken");
  });

  it("reads a file with no server list as empty", () => {
    expect(adapter.deserialize("{}").size).toBe(0);
  });
});

describe("TargetAdapter server conversion", () => {
  const a = getAdapter("windsurf");
  it("serializes stdio servers with all fields", () => {
    expect(a.toSerializedServer(server({
      cwd: "/w", env: { A: "1" }, disabled: true, disabledTools: ["t"],
    }))).toEqual({ command: "node", args: ["server.js"], cwd: "/w", env: { A: "1" }, disabled: true, disabledTools: ["t"] });
  });
  it("omits empty fields", () => {
    expect(a.toSerializedServer(server({ command: undefined, args: [], env: {} }))).toEqual({});
  });
  it("serializes remote servers by url", () => {
    expect(a.toSerializedServer(server({ transport: "sse", url: "http://x", command: "ignored" }))).toEqual({ url: "http://x" });
    expect(a.toSerializedServer(server({ transport: "sse", url: undefined }))).toEqual({});
  });
  it("converts back to hub servers", () => {
    expect(a.fromSerializedServer("x", { command: "c", args: ["a"], cwd: "/d", env: { E: "1" }, disabled: true, disabledTools: ["t"] }))
      .toEqual({ id: "x", name: "x", transport: "stdio", command: "c", args: ["a"], cwd: "/d", env: { E: "1" }, disabled: true, disabledTools: ["t"] });
    expect(a.fromSerializedServer("y", { url: "http://y" })).toEqual({ id: "y", name: "y", transport: "streamable-http", url: "http://y", disabled: false });
    expect(a.fromSerializedServer("z", {})).toEqual({ id: "z", name: "z", disabled: false });
  });
});

describe("vscode adapter", () => {
  const adapter = getAdapter("vscode");
  beforeEach(() => remove(adapter.configPath));

  it("writes under servers with a type, keeping other keys", async () => {
    write(adapter.configPath, { inputs: [{ id: "tok" }], servers: { theirs: { type: "stdio", command: "t" } } });
    await adapter.merge([
      server({ id: "local" }),
      server({ id: "remote", transport: "streamable-http", url: "https://r" }),
      server({ id: "events", transport: "sse", url: "https://e" }),
    ]);
    const out = readJson(adapter.configPath);
    expect(out.inputs).toEqual([{ id: "tok" }]);
    expect(out.servers.theirs.command).toBe("t");
    expect(out.servers.local).toMatchObject({ type: "stdio", command: "node" });
    expect(out.servers.remote).toEqual({ type: "http", url: "https://r" });
    expect(out.servers.events).toEqual({ type: "sse", url: "https://e" });
  });

  it("still reads the older mcpServers and mcp.servers layouts", () => {
    expect([...adapter.deserialize(JSON.stringify({ mcpServers: { a: {} } })).keys()]).toEqual(["a"]);
    expect([...adapter.deserialize(JSON.stringify({ mcp: { servers: { b: {} } } })).keys()]).toEqual(["b"]);
    expect(adapter.deserialize("{}").size).toBe(0);
  });
});

describe("docker adapter (YAML)", () => {
  const adapter = getAdapter("docker");
  beforeEach(() => remove(adapter.configPath));

  it("round-trips servers and keeps other keys", async () => {
    write(adapter.configPath, "registry: local\nmcpServers:\n  theirs:\n    command: t\n");
    await adapter.merge([server({ id: "ours", env: { K: "v: with colon" } })]);
    const servers = await adapter.read();
    expect(servers.get("theirs")).toEqual({ command: "t" });
    expect(servers.get("ours")).toEqual({ command: "node", args: ["server.js"], env: { K: "v: with colon" } });
    expect(read(adapter.configPath)).toContain("registry: local");
  });

  it("reads and writes the legacy servers key", async () => {
    write(adapter.configPath, "servers:\n  old:\n    command: o\n");
    expect([...(await adapter.read()).keys()]).toEqual(["old"]);
    await adapter.merge([server({ id: "n" })]);
    expect(read(adapter.configPath)).not.toContain("mcpServers");
  });

  it("creates a new file, and treats empty or blank YAML as empty", async () => {
    expect(adapter.deserialize("").size).toBe(0);
    expect(adapter.deserialize("# just a comment\n").size).toBe(0);
    await adapter.merge([server()]);
    expect(read(adapter.configPath)).toMatch(/^mcpServers:/);
  });

  it("refuses Docker's own per-server settings file instead of overwriting it", async () => {
    const original = "git:\n  foo: 1\ndart:\n  bar: 2\n";
    write(adapter.configPath, original);
    expect((await adapter.read()).size).toBe(0);
    await expect(adapter.merge([server()])).rejects.toThrow("has no server list");
    expect(read(adapter.configPath)).toBe(original);
  });

  it("refuses invalid YAML and non-mappings", () => {
    expect(() => adapter.deserialize("a: [unclosed")).toThrow("isn't valid YAML");
    expect(() => adapter.deserialize("- a\n- b\n")).toThrow("isn't a YAML mapping");
    expect(() => adapter.deserialize("just text")).toThrow("isn't a YAML mapping");
  });
});
