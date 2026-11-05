import chalk from "chalk";
import { loadConfig } from "../../config/store.js";
import { checkHealth, checkAllHealth } from "../../health/checker.js";
import { formatHealthResults } from "../../health/reporter.js";

export async function healthCommand(
  name?: string,
  options: { all?: boolean } = {}
): Promise<void> {
  const config = await loadConfig();

  if (name) {
    const server = config.servers.find((s) => s.id === name);
    if (!server) {
      console.log(chalk.red(`  Server "${name}" not found.`));
      return;
    }
    console.log(chalk.dim(`  Checking ${name}...`));
    const result = await checkHealth(server);
    console.log(formatHealthResults([result]));
    return;
  }

  const servers = options.all
    ? config.servers
    : config.servers.filter((s) => !s.disabled);

  if (servers.length === 0) {
    console.log(chalk.dim("  No servers to check."));
    return;
  }

  console.log(chalk.dim(`  Checking ${servers.length} server(s)...\n`));
  const results = await checkAllHealth(servers);
  console.log(formatHealthResults(results));
}
