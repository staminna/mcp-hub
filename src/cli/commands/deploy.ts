import chalk from "chalk";
import { type TargetName } from "../../types.js";
import { loadConfig } from "../../config/store.js";
import { deployViaSSH } from "../../deploy/ssh.js";
import { deployToK8s } from "../../deploy/kubernetes.js";

export async function deployCommand(
  name: string,
  options: {
    ssh?: string;
    k8s?: boolean;
    context?: string;
    target?: string;
  }
): Promise<void> {
  const config = await loadConfig();
  const target = (options.target ?? "claude-mcp") as TargetName;

  if (options.ssh) {
    console.log(chalk.dim(`  Deploying to ${options.ssh} via SSH...`));
    try {
      const result = await deployViaSSH(config, target, options.ssh);
      console.log(chalk.green(`  ✓ ${result}`));
    } catch (err) {
      console.log(
        chalk.red(
          `  ✗ ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
    return;
  }

  if (options.k8s) {
    console.log(chalk.dim(`  Deploying to Kubernetes...`));
    try {
      const result = await deployToK8s(config, target, {
        context: options.context,
        configMapName: name,
      });
      console.log(chalk.green(`  ✓ ${result}`));
    } catch (err) {
      console.log(
        chalk.red(
          `  ✗ ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
    return;
  }

  console.log(chalk.red("  Specify --ssh <host> or --k8s"));
}
