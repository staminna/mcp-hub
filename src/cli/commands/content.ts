import chalk from "chalk";
import {
  listSkills,
  listMemories,
  readMarkdown,
} from "../../content/markdown.js";

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ");
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

export async function skillsListCommand(options: { json?: boolean }): Promise<void> {
  const skills = await listSkills();
  if (options.json) {
    console.log(JSON.stringify(skills, null, 2));
    return;
  }
  if (skills.length === 0) {
    console.log(chalk.dim("  No skills found."));
    return;
  }
  const w = Math.max(...skills.map((s) => s.id.length), 4);
  console.log(chalk.dim(`  ${"NAME".padEnd(w)}  SOURCE  DESCRIPTION`));
  for (const s of skills) {
    console.log(
      `  ${s.id.padEnd(w)}  ${chalk.cyan(s.source.padEnd(6))}  ${chalk.dim(truncate(s.description || "—", 70))}`
    );
  }
  console.log(chalk.dim(`\n  ${skills.length} skill(s)`));
}

export async function skillsShowCommand(name: string): Promise<void> {
  const skills = await listSkills();
  const skill = skills.find((s) => s.id === name || s.name === name);
  if (!skill) {
    console.error(chalk.red(`  Skill "${name}" not found`));
    process.exitCode = 1;
    return;
  }
  console.log(chalk.dim(`  ${skill.path}\n`));
  console.log(await readMarkdown(skill.path));
}

export async function memoriesListCommand(options: {
  project?: string;
  json?: boolean;
}): Promise<void> {
  let memories = await listMemories();
  if (options.project) {
    const q = options.project.toLowerCase();
    memories = memories.filter(
      (m) => m.project.toLowerCase().includes(q) || m.projectDir.toLowerCase().includes(q)
    );
  }
  if (options.json) {
    console.log(JSON.stringify(memories, null, 2));
    return;
  }
  if (memories.length === 0) {
    console.log(chalk.dim("  No memories found."));
    return;
  }
  let current = "";
  for (const m of memories) {
    if (m.project !== current) {
      current = m.project;
      console.log(chalk.blue(`\n  ${current}`));
    }
    const type = m.isIndex ? chalk.magenta("index".padEnd(9)) : chalk.cyan((m.type ?? "—").padEnd(9));
    console.log(`    ${type}  ${m.file.padEnd(40)}  ${chalk.dim(truncate(m.description, 60))}`);
  }
  console.log(chalk.dim(`\n  ${memories.length} memory file(s)`));
}

export async function memoriesShowCommand(
  file: string,
  options: { project?: string }
): Promise<void> {
  const q = options.project?.toLowerCase();
  const matches = (await listMemories()).filter(
    (m) =>
      (m.file === file || m.file === `${file}.md` || m.name === file) &&
      (!q || m.project.toLowerCase().includes(q) || m.projectDir.toLowerCase().includes(q))
  );
  if (matches.length === 0) {
    console.error(chalk.red(`  Memory "${file}" not found`));
    process.exitCode = 1;
    return;
  }
  if (matches.length > 1) {
    console.error(chalk.yellow(`  "${file}" exists in ${matches.length} projects — narrow with --project:`));
    for (const m of matches) console.error(chalk.dim(`    ${m.project}`));
    process.exitCode = 1;
    return;
  }
  console.log(chalk.dim(`  ${matches[0].path}\n`));
  console.log(await readMarkdown(matches[0].path));
}
