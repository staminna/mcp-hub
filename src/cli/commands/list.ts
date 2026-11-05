import chalk from "chalk";
import { type TargetName } from "../../types.js";
import { loadConfig } from "../../config/store.js";

export async function listCommand(options: {
  tag?: string;
  target?: string;
  json?: boolean;
}): Promise<void> {
  const config = await loadConfig();
  let servers = config.servers;

  if (options.tag) {
    servers = servers.filter((s) => s.tags.includes(options.tag!));
  }

  if (options.target) {
    const target = options.target as TargetName;
    servers = servers.filter(
      (s) => s.targets === "*" || s.targets.includes(target)
    );
  }

  if (options.json) {
    console.log(JSON.stringify(servers, null, 2));
    return;
  }

  if (servers.length === 0) {
    console.log(chalk.dim("  No servers found. Run `mcp-hub import --all` to get started."));
    return;
  }

  const maxIdLen = Math.max(...servers.map((s) => s.id.length), 4);
  const maxTransLen = Math.max(...servers.map((s) => s.transport.length), 9);

  console.log(
    chalk.dim(
      `  ${"ID".padEnd(maxIdLen)}  ${"TRANSPORT".padEnd(maxTransLen)}  TARGETS                    TAGS`
    )
  );

  for (const s of servers) {
    const status = s.disabled ? chalk.red("●") : chalk.green("●");
    const targets =
      s.targets === "*" ? "*" : (s.targets as string[]).join(",");
    const tags = s.tags.length > 0 ? s.tags.join(",") : chalk.dim("—");

    console.log(
      `  ${status} ${s.id.padEnd(maxIdLen)}  ${s.transport.padEnd(maxTransLen)}  ${targets.padEnd(25)}  ${tags}`
    );
  }

  console.log(chalk.dim(`\n  ${servers.length} server(s)`));
}
