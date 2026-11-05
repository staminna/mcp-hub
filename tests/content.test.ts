import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  parseMarkdown,
  listSkills,
  listMemories,
  readMarkdown,
  writeMarkdown,
  assertAllowedPath,
} from "../src/content/markdown.js";

let root: string;
let skillsDir: string;
let memRoot: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mcphub-content-"));
  skillsDir = join(root, ".claude", "skills");
  memRoot = join(root, "projects");

  await mkdir(join(skillsDir, "alpha"), { recursive: true });
  await writeFile(
    join(skillsDir, "alpha", "SKILL.md"),
    "---\nname: alpha\ndescription: >-\n  Does alpha\n  things.\n---\n# Alpha\n"
  );
  await mkdir(join(skillsDir, "no-skill-file"), { recursive: true });

  // A symlinked skill dir (common in ~/.claude/skills)
  await mkdir(join(root, "elsewhere", "beta"), { recursive: true });
  await writeFile(join(root, "elsewhere", "beta", "SKILL.md"), "# Beta, no frontmatter\n");
  await symlink(join(root, "elsewhere", "beta"), join(skillsDir, "beta"));

  const mem = join(memRoot, "-proj-a", "memory");
  await mkdir(mem, { recursive: true });
  await writeFile(join(mem, "MEMORY.md"), "- [X](x.md) — hook\n");
  await writeFile(
    join(mem, "x.md"),
    "---\nname: x\ndescription: fact x\nmetadata:\n  type: feedback\n---\nbody\n"
  );
  await writeFile(join(mem, "notes.txt"), "ignored");

  process.env.MCP_HUB_SKILLS_DIRS = skillsDir;
  process.env.MCP_HUB_MEMORY_DIR = memRoot;
});

afterAll(async () => {
  delete process.env.MCP_HUB_SKILLS_DIRS;
  delete process.env.MCP_HUB_MEMORY_DIR;
  await rm(root, { recursive: true, force: true });
});

describe("parseMarkdown", () => {
  it("splits YAML frontmatter from body", () => {
    const doc = parseMarkdown("---\nname: a\ndescription: b\n---\n# Hi\n");
    expect(doc.frontmatter).toEqual({ name: "a", description: "b" });
    expect(doc.body).toBe("# Hi\n");
  });

  it("handles files without frontmatter", () => {
    expect(parseMarkdown("# Just md").frontmatter).toEqual({});
  });

  it("tolerates malformed frontmatter", () => {
    const doc = parseMarkdown("---\n: : :\n  - [\n---\nbody");
    expect(doc.frontmatter).toEqual({});
  });
});

describe("listSkills", () => {
  it("lists SKILL.md dirs, including symlinked ones", async () => {
    const skills = await listSkills();
    expect(skills.map((s) => s.id)).toEqual(["alpha", "beta"]);
    expect(skills[0]).toMatchObject({ source: "claude", name: "alpha", description: "Does alpha things." });
    expect(skills[1].name).toBe("beta"); // falls back to dir name
  });
});

describe("listMemories", () => {
  it("lists .md memories with type and index flag", async () => {
    const mems = await listMemories();
    expect(mems.map((m) => m.file)).toEqual(["MEMORY.md", "x.md"]);
    expect(mems[0].isIndex).toBe(true);
    expect(mems[1]).toMatchObject({ name: "x", type: "feedback", description: "fact x" });
  });
});

describe("read/write safety", () => {
  it("rejects paths outside the allowed roots", () => {
    expect(() => assertAllowedPath("/etc/passwd.md")).toThrow(/outside/);
    expect(() => assertAllowedPath(join(skillsDir, "..", "..", "evil.md"))).toThrow(/outside/);
  });

  it("rejects non-markdown files", () => {
    expect(() => assertAllowedPath(join(memRoot, "-proj-a", "memory", "notes.txt"))).toThrow(/\.md/);
  });

  it("writes in place, including through a symlinked dir", async () => {
    const p = join(skillsDir, "beta", "SKILL.md");
    await writeMarkdown(p, "# Beta v2\n");
    expect(await readMarkdown(p)).toBe("# Beta v2\n");
    expect(await readFile(join(root, "elsewhere", "beta", "SKILL.md"), "utf-8")).toBe("# Beta v2\n");
  });

  it("refuses to create new files", async () => {
    await expect(writeMarkdown(join(skillsDir, "alpha", "NEW.md"), "x")).rejects.toThrow(/does not exist/);
  });
});
