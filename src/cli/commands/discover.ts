import chalk from "chalk";
import { searchNpm } from "../../discovery/npm.js";
import { findRunningMcpProcesses } from "../../discovery/process.js";
import { searchRegistry } from "../../discovery/registry.js";

export async function discoverCommand(options: {
  npm?: boolean;
  running?: boolean;
}): Promise<void> {
  if (options.npm) {
    console.log(chalk.blue("  npm registry:"));
    const results = await searchNpm();
    if (results.length === 0) {
      console.log(chalk.dim("    No packages found"));
    } else {
      for (const r of results) {
        console.log(`    ${chalk.green(r.name)}`);
        if (r.description)
          console.log(chalk.dim(`      ${r.description.substring(0, 80)}`));
      }
    }
    console.log();
  }

  if (options.running) {
    console.log(chalk.blue("  Running processes:"));
    const results = await findRunningMcpProcesses();
    if (results.length === 0) {
      console.log(chalk.dim("    No MCP processes found"));
    } else {
      for (const r of results) {
        console.log(`    ${chalk.yellow(r.name)}: ${r.description}`);
      }
    }
    console.log();
  }

  if (!options.npm && !options.running) {
    console.log(chalk.blue("  Popular MCP servers:"));
    const results = searchRegistry();
    for (const r of results) {
      console.log(`    ${chalk.green(r.name)}`);
      if (r.description) console.log(chalk.dim(`      ${r.description}`));
      if (r.installCommand)
        console.log(chalk.dim(`      $ ${r.installCommand}`));
    }
  }
}
