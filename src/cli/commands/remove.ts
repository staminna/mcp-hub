import chalk from "chalk";
import {
  loadConfig,
  saveConfig,
  findServer,
  removeServer,
} from "../../config/store.js";

export async function removeCommand(name: string): Promise<void> {
  const config = await loadConfig();
  const server = findServer(config, name);

  if (!server) {
    console.log(chalk.red(`  Server "${name}" not found.`));
    return;
  }

  const updated = removeServer(config, name);
  await saveConfig(updated);
  console.log(chalk.green(`  - ${name} removed`));
}

export async function enableCommand(name: string): Promise<void> {
  const config = await loadConfig();
  const server = findServer(config, name);

  if (!server) {
    console.log(chalk.red(`  Server "${name}" not found.`));
    return;
  }

  server.disabled = false;
  await saveConfig(config);
  console.log(chalk.green(`  ● ${name} enabled`));
}

export async function disableCommand(name: string): Promise<void> {
  const config = await loadConfig();
  const server = findServer(config, name);

  if (!server) {
    console.log(chalk.red(`  Server "${name}" not found.`));
    return;
  }

  server.disabled = true;
  await saveConfig(config);
  console.log(chalk.yellow(`  ○ ${name} disabled`));
}
