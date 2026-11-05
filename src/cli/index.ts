import { Command } from "commander";
import { importCommand } from "./commands/import.js";
import { listCommand } from "./commands/list.js";
import { addCommand } from "./commands/add.js";
import { removeCommand, enableCommand, disableCommand } from "./commands/remove.js";
import { syncCommand } from "./commands/sync.js";
import { diffCommand } from "./commands/diff.js";
import { backupCommand } from "./commands/backup.js";
import { healthCommand } from "./commands/health.js";
import { discoverCommand } from "./commands/discover.js";
import { serveCommand } from "./commands/serve.js";
import { deployCommand } from "./commands/deploy.js";
import {
  skillsListCommand,
  skillsShowCommand,
  memoriesListCommand,
  memoriesShowCommand,
} from "./commands/content.js";

export function createCLI(): Command {
  const program = new Command();

  program
    .name("mcp-hub")
    .description("Central MCP Server Manager")
    .version("1.0.0");

  program
    .command("import")
    .description("Import servers from IDE configs")
    .option("--from <ide>", "Import from specific IDE")
    .option("--all", "Import from all IDEs")
    .action(importCommand);

  program
    .command("list")
    .description("List all servers")
    .option("--tag <tag>", "Filter by tag")
    .option("--target <ide>", "Filter by target IDE")
    .option("--json", "Output as JSON")
    .action(listCommand);

  program
    .command("add <name>")
    .description("Add a new server")
    .option("--command <cmd>", "stdio command")
    .option("--args <args...>", "Command arguments")
    .option("--url <url>", "HTTP transport URL")
    .option("--env <vars...>", "Environment variables (KEY=VAL)")
    .option("--tags <tags...>", "Tags")
    .option("--targets <targets...>", "Target IDEs")
    .option("--description <desc>", "Description")
    .option("--cwd <dir>", "Working directory")
    .action(addCommand);

  program
    .command("remove <name>")
    .description("Remove a server")
    .action(removeCommand);

  program
    .command("enable <name>")
    .description("Enable a server")
    .action(enableCommand);

  program
    .command("disable <name>")
    .description("Disable a server")
    .action(disableCommand);

  program
    .command("sync")
    .description("Sync config to IDE targets")
    .option("--target <ide>", "Sync to specific IDE")
    .option("--dry-run", "Preview changes without writing")
    .option("--all", "Sync to all targets")
    .action(syncCommand);

  program
    .command("diff")
    .description("Show differences between hub and IDE configs")
    .option("--target <ide>", "Show diff for specific IDE")
    .action(diffCommand);

  program
    .command("backup")
    .description("Backup all IDE configs")
    .action(backupCommand);

  program
    .command("health [name]")
    .description("Check server health")
    .option("--all", "Include disabled servers")
    .action(healthCommand);

  program
    .command("discover")
    .description("Discover MCP servers")
    .option("--npm", "Search npm registry")
    .option("--running", "Find running MCP processes")
    .action(discoverCommand);

  program
    .command("serve")
    .description("Start web dashboard")
    .option("--port <port>", "Port number", "3847")
    .action(async (opts) => {
      // A busy port is already explained by serveCommand; don't add a stack trace
      await serveCommand({ port: parseInt(opts.port) }).catch(() => {});
    });

  program
    .command("deploy <name>")
    .description("Deploy config to remote")
    .option("--ssh <host>", "Deploy via SSH")
    .option("--k8s", "Deploy to Kubernetes")
    .option("--context <ctx>", "K8s context")
    .option("--target <ide>", "Target config format")
    .action(deployCommand);

  const skills = program
    .command("skills")
    .description("Browse skills (~/.claude/skills, ~/.gemini/skills)");
  skills
    .command("list")
    .description("List skills")
    .option("--json", "Output as JSON")
    .action(skillsListCommand);
  skills
    .command("show <name>")
    .description("Print a skill's SKILL.md")
    .action(skillsShowCommand);

  const memories = program
    .command("memories")
    .description("Browse memories (~/.claude/projects/*/memory)");
  memories
    .command("list")
    .description("List memory files")
    .option("--project <p>", "Filter by project (substring)")
    .option("--json", "Output as JSON")
    .action(memoriesListCommand);
  memories
    .command("show <file>")
    .description("Print a memory file")
    .option("--project <p>", "Disambiguate by project (substring)")
    .action(memoriesShowCommand);

  return program;
}
