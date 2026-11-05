import { describe, it, expect, vi } from "vitest";
import { join, resolve, dirname } from "path";
import { mkdirSync, symlinkSync, readFileSync, lstatSync } from "fs";
import { fileURLToPath } from "url";
import { projectLabel, skillDirs, memoryRoot, listSkills, listMemories, writeMarkdown } from "../src/content/markdown.js";
import { saveConfig, loadConfig } from "../src/config/store.js";
import { formatHealthResults } from "../src/health/reporter.js";
import { checkHealth } from "../src/health/checker.js";
import { config, server, write, home, hubDir } from "./helpers.js";

describe("markdown folders", () => {
  it("defaults to ~/.claude/skills, ~/.gemini/skills and ~/.claude/projects", () => {
    const saved = { s: process.env.MCP_HUB_SKILLS_DIRS, m: process.env.MCP_HUB_MEMORY_DIR };
    delete process.env.MCP_HUB_SKILLS_DIRS;
    delete process.env.MCP_HUB_MEMORY_DIR;
    try {
      expect(skillDirs()).toEqual([join(home(), ".claude", "skills"), join(home(), ".gemini", "skills")]);
      expect(memoryRoot()).toBe(join(home(), ".claude", "projects"));
      process.env.MCP_HUB_MEMORY_DIR = ""; // empty means "use the default", not the current folder
      expect(memoryRoot()).toBe(join(home(), ".claude", "projects"));
    } finally {
      process.env.MCP_HUB_SKILLS_DIRS = saved.s;
      process.env.MCP_HUB_MEMORY_DIR = saved.m;
    }
  });

  it("labels project folders relative to home", () => {
    const slug = home().replace(/[/.]/g, "-");
    expect(projectLabel("-")).toBe("/");
    expect(projectLabel(slug)).toBe("~");
    expect(projectLabel(slug + "-code-app")).toBe("~/code-app");
    expect(projectLabel("-opt-other")).toBe("-opt-other");
  });

  it("names a skills folder by its own name when it has no dotted parent", async () => {
    const dir = join(hubDir(), "skills");
    write(join(dir, "s", "SKILL.md"), "# s\n");
    process.env.MCP_HUB_SKILLS_DIRS = "/:" + dir; // "/" has no parent name
    try {
      const skills = await listSkills();
      expect(skills.find((s) => s.id === "s")!.source).toBe("hub");
    } finally {
      process.env.MCP_HUB_SKILLS_DIRS = join(home(), ".claude", "skills") + ":" + join(home(), ".gemini", "skills");
    }
  });

  it("ignores folders named *.md in a memory folder", async () => {
    const mem = join(home(), ".claude", "projects", "-x", "memory");
    mkdirSync(join(mem, "folder.md"), { recursive: true });
    write(join(mem, "real.md"), "hi\n");
    expect((await listMemories()).filter((m) => m.projectDir === "-x").map((m) => m.file)).toEqual(["real.md"]);
  });

  it("writes through a symlinked file instead of replacing the link", async () => {
    const mem = join(home(), ".claude", "projects", "-y", "memory");
    const target = join(hubDir(), "outside.md");
    write(target, "old\n");
    mkdirSync(mem, { recursive: true });
    symlinkSync(target, join(mem, "link.md"));
    await writeMarkdown(join(mem, "link.md"), "new\n");
    expect(lstatSync(join(mem, "link.md")).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf-8")).toBe("new\n");
  });
});

describe("config store", () => {
  it("creates the folder when saving to a new place", async () => {
    const p = join(hubDir(), "new", "dir", "hub.json");
    await saveConfig(config([server()]), p);
    expect((await loadConfig(p)).servers).toHaveLength(1);
  });
});

describe("defaults", () => {
  it("uses the project folder when MCP_HUB_HOME isn't set", async () => {
    const saved = process.env.MCP_HUB_HOME;
    delete process.env.MCP_HUB_HOME;
    vi.resetModules();
    try {
      const d = await import("../src/config/defaults.js");
      expect(d.HUB_HOME).toBe(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
    } finally {
      process.env.MCP_HUB_HOME = saved;
      vi.resetModules();
    }
  });
});

describe("health edges", () => {
  it("shows ? for unknown status", () => {
    expect(formatHealthResults([{ serverId: "x", status: "unknown", checkedAt: "" }])).toContain("? x");
  });
  it("runs a command with no args", async () => {
    expect((await checkHealth(server({ command: "true", args: undefined }), { envFile: {} })).status).toBe("healthy");
  });
});

describe("entry point", () => {
  it("parses the command line", async () => {
    const argv = process.argv;
    const out: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m) => { out.push(String(m)); });
    process.argv = ["node", "mcp-hub", "list", "--json"];
    try {
      await import("../src/index.js");
      await vi.waitFor(() => expect(out.join("")).toMatch(/^\[/));
    } finally {
      process.argv = argv;
      log.mockRestore();
    }
  });
});
