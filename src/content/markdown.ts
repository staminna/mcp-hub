import { readFile, readdir, stat } from "fs/promises";
import { writeFilePrivate } from "../fs/private.js";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve, sep, basename, dirname, extname } from "path";
import { parse as parseYaml } from "yaml";

/**
 * Skills and memories are markdown files that live where Claude/Gemini keep
 * them. The hub reads and edits them in place — no copies, no sync.
 *
 *   skills:   <skillsDir>/<name>/SKILL.md
 *   memories: <memoryRoot>/<project>/memory/*.md
 */

const home = homedir();

export function skillDirs(): string[] {
  const env = process.env.MCP_HUB_SKILLS_DIRS;
  if (env) return env.split(":").filter(Boolean);
  return [join(home, ".claude", "skills"), join(home, ".gemini", "skills")];
}

export function memoryRoot(): string {
  return process.env.MCP_HUB_MEMORY_DIR ?? join(home, ".claude", "projects");
}

export interface Frontmatter {
  [key: string]: unknown;
}

export interface MarkdownDoc {
  frontmatter: Frontmatter;
  body: string;
}

export interface SkillEntry {
  id: string; // directory name
  source: string; // "claude" | "gemini" | dir basename
  path: string;
  name: string;
  description: string;
}

export interface MemoryEntry {
  project: string; // readable project label
  projectDir: string; // raw directory name under memoryRoot
  file: string;
  path: string;
  name: string;
  description: string;
  type?: string;
  isIndex: boolean;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMarkdown(raw: string): MarkdownDoc {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: {}, body: raw };
  let frontmatter: Frontmatter = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === "object") frontmatter = parsed as Frontmatter;
  } catch {
    // Malformed frontmatter: treat the file as plain markdown
  }
  return { frontmatter, body: raw.slice(m[0].length) };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

export async function listSkills(): Promise<SkillEntry[]> {
  const skills: SkillEntry[] = [];
  for (const dir of skillDirs()) {
    // ~/.claude/skills → "claude", ~/.gemini/skills → "gemini"
    const source = basename(dirname(dir)).replace(/^\./, "") || basename(dir);
    for (const id of (await safeReaddir(dir)).sort()) {
      const path = join(dir, id, "SKILL.md");
      if (!existsSync(path)) continue;
      const { frontmatter } = parseMarkdown(await readFile(path, "utf-8"));
      skills.push({
        id,
        source,
        path,
        name: str(frontmatter.name) || id,
        description: str(frontmatter.description),
      });
    }
  }
  return skills;
}

/** "-Users-me-2026-foo" → "~/2026/foo" (best effort; dashes are ambiguous) */
export function projectLabel(dirName: string): string {
  const homeSlug = home.replace(/[/.]/g, "-");
  if (dirName === "-") return "/";
  if (dirName === homeSlug) return "~";
  if (dirName.startsWith(homeSlug + "-")) {
    return "~/" + dirName.slice(homeSlug.length + 1);
  }
  return dirName;
}

export async function listMemories(): Promise<MemoryEntry[]> {
  const root = memoryRoot();
  const memories: MemoryEntry[] = [];
  for (const projectDir of (await safeReaddir(root)).sort()) {
    const memDir = join(root, projectDir, "memory");
    for (const file of (await safeReaddir(memDir)).sort()) {
      if (extname(file) !== ".md") continue;
      const path = join(memDir, file);
      if (!(await stat(path)).isFile()) continue;
      const { frontmatter } = parseMarkdown(await readFile(path, "utf-8"));
      const meta = (frontmatter.metadata ?? {}) as Frontmatter;
      memories.push({
        project: projectLabel(projectDir),
        projectDir,
        file,
        path,
        name: str(frontmatter.name) || file.replace(/\.md$/, ""),
        description: str(frontmatter.description),
        type: str(meta.type) || str(frontmatter.type) || undefined,
        isIndex: file === "MEMORY.md",
      });
    }
  }
  return memories;
}

/**
 * Only .md files under a skills dir or the memory root can be read/written.
 * Uses the lexical path (not realpath) because many skills are symlinks.
 */
export function assertAllowedPath(path: string): string {
  const abs = resolve(path);
  if (extname(abs) !== ".md") {
    throw new Error("only .md files are allowed");
  }
  const roots = [...skillDirs(), memoryRoot()].map((r) => resolve(r) + sep);
  if (!roots.some((r) => abs.startsWith(r))) {
    throw new Error("path is outside the skills/memory folders");
  }
  return abs;
}

export async function readMarkdown(path: string): Promise<string> {
  return readFile(assertAllowedPath(path), "utf-8");
}

export async function writeMarkdown(path: string, content: string): Promise<void> {
  const abs = assertAllowedPath(path);
  if (!existsSync(abs)) throw new Error("file does not exist");
  // Keeps the file's mode, writes through symlinks (many skills are links), atomic
  await writeFilePrivate(abs, content);
}
