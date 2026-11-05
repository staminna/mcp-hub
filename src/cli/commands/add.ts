import chalk from "chalk";
import { type McpServer, type TargetName } from "../../types.js";
import { loadConfig, saveConfig, slugify, addServer } from "../../config/store.js";
import { DEFAULT_HUB_SETTINGS } from "../../config/defaults.js";

export async function addCommand(
  name: string,
  options: {
    command?: string;
    args?: string[];
    url?: string;
    env?: string[];
    tags?: string[];
    targets?: string[];
    description?: string;
    cwd?: string;
  }
): Promise<void> {
  const config = await loadConfig();
  const id = slugify(name);

  const existing = config.servers.find((s) => s.id === id);
  if (existing) {
    console.log(chalk.red(`  Server "${id}" already exists. Use a different name.`));
    return;
  }

  // Parse env KEY=VAL pairs
  const env: Record<string, string> = {};
  if (options.env) {
    for (const e of options.env) {
      const eqIdx = e.indexOf("=");
      if (eqIdx > 0) {
        env[e.substring(0, eqIdx)] = e.substring(eqIdx + 1);
      }
    }
  }

  const transport = options.url ? "streamable-http" : "stdio";
  const targets = options.targets
    ? (options.targets as TargetName[])
    : DEFAULT_HUB_SETTINGS.defaultTargets;

  const server: McpServer = {
    id,
    name,
    description: options.description,
    transport,
    command: options.command,
    args: options.args,
    cwd: options.cwd,
    url: options.url,
    env: Object.keys(env).length > 0 ? env : undefined,
    tags: options.tags ?? [],
    disabled: false,
    targets,
  };

  const updated = addServer(config, server);
  await saveConfig(updated);

  console.log(chalk.green(`  + ${id}`));
  console.log(chalk.dim(`    transport: ${transport}`));
  if (server.command) console.log(chalk.dim(`    command: ${server.command} ${(server.args ?? []).join(" ")}`));
  if (server.url) console.log(chalk.dim(`    url: ${server.url}`));
  console.log(chalk.dim(`    targets: ${Array.isArray(targets) ? targets.join(", ") : targets}`));
}
