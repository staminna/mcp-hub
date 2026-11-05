import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readdirSync } from "fs";

const mocks = vi.hoisted(() => ({
  serve: vi.fn(async () => ({})),
  ssh: vi.fn(async (): Promise<string> => "ssh ok"),
  k8s: vi.fn(async (): Promise<string> => "k8s ok"),
  npm: vi.fn(async () => [] as unknown[]),
  running: vi.fn(async () => [] as unknown[]),
}));
vi.mock("../src/cli/commands/serve.js", () => ({ serveCommand: mocks.serve }));
vi.mock("../src/deploy/ssh.js", () => ({ deployViaSSH: mocks.ssh }));
vi.mock("../src/deploy/kubernetes.js", () => ({ deployToK8s: mocks.k8s }));
vi.mock("../src/discovery/npm.js", () => ({ searchNpm: mocks.npm }));
vi.mock("../src/discovery/process.js", () => ({ findRunningMcpProcesses: mocks.running }));

import { createCLI } from "../src/cli/index.js";
import { HUB_CONFIG_PATH, HUB_ENV_PATH } from "../src/config/defaults.js";
import { loadConfig, saveConfig } from "../src/config/store.js";
import { getAdapter } from "../src/targets/registry.js";
import { server, config, write, read, readJson, remove, home, captureLog } from "./helpers.js";

/** Run `mcp-hub ...args`, returning stdout+stderr with colours stripped. */
async function cli(...args: string[]): Promise<string> {
  const errs: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => errs.push(a.join(" "));
  try {
    const out = await captureLog(() => createCLI().exitOverride().parseAsync(["node", "mcp-hub", ...args]));
    return [out, ...errs.map((e) => e.replace(/\x1b\[[0-9;]*m/g, ""))].join("\n");
  } finally {
    console.error = origErr;
  }
}

const node = process.execPath;
const cursor = getAdapter("cursor");

beforeEach(async () => {
  process.exitCode = 0;
  remove(join(home(), ".cursor"));
  remove(join(home(), ".codeium"));
  remove(join(home(), "backups"));
  remove(HUB_ENV_PATH);
  await saveConfig(config([
    server({ id: "alpha", command: node, args: ["-e", "process.exit(0)"], tags: ["fs"], targets: ["cursor"] }),
    server({ id: "beta", disabled: true, targets: "*" }),
  ], { autoBackup: true }));
});
afterEach(() => { process.exitCode = 0; });

describe("list", () => {
  it("prints a table, filters by tag and target, and prints JSON", async () => {
    const out = await cli("list");
    expect(out).toMatch(/alpha\s+stdio\s+cursor\s+fs/);
    expect(out).toMatch(/beta\s+stdio\s+\*\s+—/);
    expect(out).toMatch(/2 server\(s\)/);
    expect(await cli("list", "--tag", "fs")).not.toMatch(/beta/);
    expect(await cli("list", "--target", "windsurf")).toMatch(/1 server\(s\)/);
    expect(JSON.parse(await cli("list", "--json")).length).toBe(2);
    expect(await cli("list", "--tag", "none")).toMatch(/No servers found/);
  });
});

describe("add / remove / enable / disable", () => {
  it("adds a stdio server with env, tags and targets", async () => {
    const out = await cli("add", "My Server", "--command", "npx", "--args", "-y", "pkg", "--env", "A=1", "B=x=y", "bad",
      "--tags", "t", "--targets", "cursor", "--description", "d", "--cwd", "/w");
    expect(out).toMatch(/\+ my-server/);
    expect(out).toMatch(/command: npx -y pkg/);
    const s = (await loadConfig()).servers.find((x) => x.id === "my-server")!;
    expect(s).toMatchObject({ name: "My Server", env: { A: "1", B: "x=y" }, tags: ["t"], targets: ["cursor"], cwd: "/w", transport: "stdio" });
  });

  it("adds a remote server with default targets and no env", async () => {
    const out = await cli("add", "remote", "--url", "https://r");
    expect(out).toMatch(/url: https:\/\/r/);
    const s = (await loadConfig()).servers.find((x) => x.id === "remote")!;
    expect(s).toMatchObject({ transport: "streamable-http", targets: ["claude-mcp", "windsurf", "cursor"] });
    expect(s.env).toBeUndefined();
    expect(await cli("add", "plain", "--command", "srv")).toMatch(/command: srv $/m);
  });

  it("refuses duplicates and unknown editors", async () => {
    expect(await cli("add", "alpha", "--command", "x")).toMatch(/already exists/);
    expect(await cli("add", "zeta", "--targets", "cursorr")).toMatch(/Unknown editor "cursorr"/);
    expect(process.exitCode).toBe(1);
    expect((await loadConfig()).servers.map((s) => s.id)).not.toContain("zeta");
  });

  it("enables, disables and removes", async () => {
    expect(await cli("enable", "beta")).toMatch(/beta enabled/);
    expect(await cli("disable", "alpha")).toMatch(/alpha disabled/);
    expect((await loadConfig()).servers.map((s) => s.disabled)).toEqual([true, false]);
    expect(await cli("remove", "beta")).toMatch(/beta removed/);
    for (const cmd of ["enable", "disable", "remove"]) expect(await cli(cmd, "nope")).toMatch(/not found/);
  });
});

describe("sync and diff", () => {
  it("diff shows adds, updates (field names only) and unmanaged servers", async () => {
    write(cursor.configPath, { mcpServers: {
      alpha: { command: node, args: ["old"], env: { GONE: "x", SAME: "1" } },
      theirs: { command: "t" },
    } });
    await saveConfig(config([
      server({ id: "alpha", command: node, args: ["-e", "process.exit(0)"], env: { SAME: "1", NEW: "secret-value" }, targets: ["cursor"] }),
      server({ id: "fresh", targets: ["cursor"] }),
      server({ id: "held", env: { T: "${NOT_SET_CLI}" }, targets: ["cursor"] }),
    ]));
    const out = await cli("diff", "--target", "cursor");
    expect(out).toMatch(/held would be skipped — missing in .env: NOT_SET_CLI/);
    expect(out).toMatch(/~ alpha\n\s+changed: args, env.GONE \(removed\), env.NEW \(new\)/);
    expect(out).toMatch(/\+ fresh/);
    expect(out).toMatch(/= theirs \(unmanaged here, kept\)/);
    expect(out).not.toMatch(/secret-value/);
  });

  it("diff reports in-sync targets, keeps going past an unreadable one, and rejects unknown targets", async () => {
    write(cursor.configPath, "{ broken");
    const out = await cli("diff");
    expect(out).toMatch(/✗ cursor: .*isn't valid JSON/);
    expect(out).toMatch(/claude-mcp: in sync/);
    expect(await cli("diff", "--target", "nope")).toMatch(/Unknown editor "nope"/);
  });

  it("diff labels a changed env value and a changed non-env field", async () => {
    write(cursor.configPath, { mcpServers: { alpha: { command: "old", env: { A: "1" } } } });
    await saveConfig(config([server({ id: "alpha", command: "new", args: [], env: { A: "2" }, targets: ["cursor"] })]));
    expect(await cli("diff", "--target", "cursor")).toMatch(/changed: command, env.A$/m);
  });

  it("sync writes one target with a backup, then reports no changes", async () => {
    write(cursor.configPath, { mcpServers: { theirs: { command: "t" } } });
    const out = await cli("sync", "--target", "cursor");
    expect(out).toMatch(/→ cursor:\n\s+backed up\n\s+\+ alpha\n\s+= 1 unmanaged server\(s\) kept/);
    expect(await cli("sync", "--target", "cursor")).toMatch(/✓ cursor: no changes/);
    expect(readdirSync(join(home(), "backups", "cursor"))).toHaveLength(1);
  });

  it("sync shows updates, skipped servers and errors", async () => {
    write(cursor.configPath, { mcpServers: { alpha: { command: "old" } } });
    await saveConfig(config([
      server({ id: "alpha", targets: ["cursor"] }),
      server({ id: "held", env: { T: "${NOT_SET_CLI}" }, targets: ["cursor"] }),
    ]));
    const out = await cli("sync", "--target", "cursor");
    expect(out).toMatch(/! cursor: skipped held — missing in .env: NOT_SET_CLI/);
    expect(out).toMatch(/~ alpha/);
    write(cursor.configPath, "{ broken");
    expect(await cli("sync", "--target", "cursor")).toMatch(/✗ cursor: .*isn't valid JSON/);
  });

  it("sync --dry-run touches nothing; sync without --target does every editor", async () => {
    expect(await cli("sync", "--dry-run")).toMatch(/\[dry run\][\s\S]*cursor/);
    expect(() => read(cursor.configPath)).toThrow();
    const out = await cli("sync");
    expect(out).toMatch(/\+ alpha/);
    expect(out).toMatch(/windsurf: no changes/);
    expect(await cli("sync", "--target", "nope")).toMatch(/Unknown editor/);
  });
});

describe("import", () => {
  it("imports new servers, moves secrets to .env, and skips existing ones", async () => {
    // Windsurf is read before Cursor
    write(getAdapter("windsurf").configPath, { mcpServers: {
      alpha: { command: "dup" },
      "New One": { command: "n", env: { API_TOKEN: "tok_1234567890" } },
    } });
    write(cursor.configPath, { mcpServers: { "new-one": { command: "twice" } } });
    const out = await cli("import");
    expect(out).toMatch(/skip alpha \(already exists\)/);
    expect(out).toMatch(/\+ New One/);
    expect(out).toMatch(/skip new-one \(already exists\)/); // same slug from the second editor
    expect(out).toMatch(/moved 1 secret\(s\) to .env: NEW_ONE_API_TOKEN/);
    expect(out).toMatch(/skip VS Code \(not found\)/);
    const s = (await loadConfig()).servers.find((x) => x.id === "new-one")!;
    expect(s).toMatchObject({ name: "New One", env: { API_TOKEN: "${NEW_ONE_API_TOKEN}" }, targets: ["windsurf"] });
    expect(read(HUB_ENV_PATH)).toMatch(/NEW_ONE_API_TOKEN=tok_1234567890/);
  });

  it("imports without secrets, from one editor, and reports unreadable configs", async () => {
    write(cursor.configPath, { mcpServers: { plain: { url: "https://p" } } });
    expect(await cli("import", "--from", "cursor")).toMatch(/1 imported/);
    expect(read(HUB_CONFIG_PATH)).not.toMatch(/secret/);
    write(cursor.configPath, "{ broken");
    expect(await cli("import", "--from", "cursor")).toMatch(/error: .*isn't valid JSON/);
    expect(await cli("import", "--from", "nope")).toMatch(/Unknown editor "nope"/);
  });

  it("imports a server with neither command nor url as stdio", async () => {
    write(cursor.configPath, { mcpServers: { empty: {} } });
    await cli("import", "--from", "cursor");
    expect((await loadConfig()).servers.find((x) => x.id === "empty")!.transport).toBe("stdio");
  });

  it("reports non-Error failures", async () => {
    write(cursor.configPath, { mcpServers: {} });
    const spy = vi.spyOn(cursor.constructor.prototype, "read").mockRejectedValueOnce("odd");
    expect(await cli("import", "--from", "cursor")).toMatch(/error: odd/);
    spy.mockRestore();
  });
});

describe("backup", () => {
  it("backs up the editor configs that exist", async () => {
    write(cursor.configPath, { mcpServers: {} });
    const out = await cli("backup");
    expect(out).toMatch(/✓ Cursor → .*backups\/cursor\//);
    expect(out).toMatch(/skip Windsurf \(not found\)/);
  });
});

describe("health", () => {
  it("checks one server, all enabled, or all", async () => {
    expect(await cli("health", "alpha")).toMatch(/✓ alpha/);
    expect(await cli("health", "nope")).toMatch(/Server "nope" not found/);
    expect(await cli("health")).toMatch(/1\/1 healthy/);
    expect(await cli("health", "--all")).toMatch(/\/2 healthy/);
    await saveConfig(config([server({ disabled: true })]));
    expect(await cli("health")).toMatch(/No servers to check/);
  });
});

describe("discover", () => {
  it("shows the registry by default", async () => {
    expect(await cli("discover")).toMatch(/Popular MCP servers:[\s\S]*server-filesystem[\s\S]*\$ npx -y/);
  });
  it("searches npm and running processes", async () => {
    mocks.npm.mockResolvedValueOnce([{ name: "a", description: "x".repeat(100) }, { name: "b" }]);
    mocks.running.mockResolvedValueOnce([{ name: "p", description: "Running process: p" }]);
    const out = await cli("discover", "--npm", "--running");
    expect(out).toMatch(/a\n\s+x{80}\n/);
    expect(out).toMatch(/p: Running process: p/);
    const none = await cli("discover", "--npm", "--running");
    expect(none).toMatch(/No packages found[\s\S]*No MCP processes found/);
  });
});

describe("serve and deploy", () => {
  it("passes the port to serve", async () => {
    await cli("serve", "--port", "4000");
    expect(mocks.serve).toHaveBeenCalledWith({ port: 4000 });
    mocks.serve.mockRejectedValueOnce(new Error("busy"));
    await expect(cli("serve")).resolves.toBe("\n".repeat(0));
  });

  it("deploys via SSH or Kubernetes and reports errors", async () => {
    expect(await cli("deploy", "cfg", "--ssh", "box", "--target", "cursor")).toMatch(/✓ ssh ok/);
    expect(mocks.ssh.mock.calls[0]).toEqual([expect.anything(), "cursor", "box"]);
    mocks.ssh.mockRejectedValueOnce(new Error("auth failed"));
    expect(await cli("deploy", "cfg", "--ssh", "box")).toMatch(/✗ auth failed/);
    expect(await cli("deploy", "cfg", "--k8s", "--context", "prod")).toMatch(/✓ k8s ok/);
    expect(mocks.k8s.mock.calls[0]).toEqual([expect.anything(), "claude-mcp", { context: "prod", configMapName: "cfg" }]);
    mocks.k8s.mockRejectedValueOnce(new Error("forbidden"));
    expect(await cli("deploy", "cfg", "--k8s")).toMatch(/✗ forbidden/);
    mocks.k8s.mockRejectedValueOnce("plain");
    expect(await cli("deploy", "cfg", "--k8s")).toMatch(/✗ plain/);
    mocks.ssh.mockRejectedValueOnce("plain-ssh");
    expect(await cli("deploy", "cfg", "--ssh", "h")).toMatch(/✗ plain-ssh/);
    expect(await cli("deploy", "cfg")).toMatch(/Specify --ssh <host> or --k8s/);
    expect(await cli("deploy", "cfg", "--ssh", "h", "--target", "nope")).toMatch(/Unknown editor/);
  });
});

describe("skills and memories", () => {
  const skills = join(home(), ".claude", "skills");
  const projects = join(home(), ".claude", "projects");
  beforeEach(() => {
    remove(skills);
    remove(projects);
  });

  it("lists and shows skills", async () => {
    expect(await cli("skills", "list")).toMatch(/No skills found/);
    write(join(skills, "demo", "SKILL.md"), `---\nname: Demo Skill\ndescription: ${"word ".repeat(30)}\n---\n# Body\n`);
    write(join(skills, "bare", "SKILL.md"), "# no frontmatter\n");
    const out = await cli("skills", "list");
    expect(out).toMatch(/demo\s+claude\s+word word.*…/);
    expect(out).toMatch(/bare\s+claude\s+—/);
    expect(JSON.parse(await cli("skills", "list", "--json"))).toHaveLength(2);
    expect(await cli("skills", "show", "Demo Skill")).toMatch(/# Body/);
    expect(await cli("skills", "show", "nope")).toMatch(/Skill "nope" not found/);
    expect(process.exitCode).toBe(1);
  });

  it("lists and shows memories, by project", async () => {
    expect(await cli("memories", "list")).toMatch(/No memories found/);
    write(join(projects, "-a", "memory", "MEMORY.md"), "- index\n");
    write(join(projects, "-a", "memory", "fact.md"), "---\nname: fact\ndescription: a fact\nmetadata:\n  type: user\n---\nA\n");
    write(join(projects, "-b", "memory", "fact.md"), "---\nname: fact\n---\nB\n");
    const out = await cli("memories", "list");
    expect(out).toMatch(/-a\n\s+index\s+MEMORY.md/);
    expect(out).toMatch(/user\s+fact.md\s+a fact/);
    expect(out).toMatch(/—\s+fact.md/);
    expect(await cli("memories", "list", "--project", "-b")).toMatch(/1 memory file/);
    expect(JSON.parse(await cli("memories", "list", "--json"))).toHaveLength(3);
    expect(await cli("memories", "show", "fact")).toMatch(/exists in 2 projects[\s\S]*-a[\s\S]*-b/);
    expect(await cli("memories", "show", "fact.md", "--project", "-b")).toMatch(/\nB\n/);
    expect(await cli("memories", "show", "MEMORY")).toMatch(/- index/);
    expect(await cli("memories", "show", "nope")).toMatch(/Memory "nope" not found/);
  });
});
