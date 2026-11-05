import chalk from "chalk";
import { loadConfig } from "../../config/store.js";
import { getAllAdapters } from "../../targets/registry.js";
import { createBackup } from "../../sync/backup.js";

export async function backupCommand(): Promise<void> {
  const config = await loadConfig();
  const adapters = getAllAdapters();

  for (const adapter of adapters) {
    if (!adapter.exists()) {
      console.log(chalk.dim(`  skip ${adapter.config.displayName} (not found)`));
      continue;
    }

    const path = await createBackup(
      adapter.name,
      adapter.configPath,
      config.settings.backupDir
    );

    if (path) {
      console.log(chalk.green(`  ✓ ${adapter.config.displayName} → ${path}`));
    }
  }
}
