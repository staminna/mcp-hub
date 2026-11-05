import chalk from "chalk";
import { type TargetName } from "../../types.js";
import { loadConfig } from "../../config/store.js";
import { syncTarget, syncAll } from "../../sync/engine.js";
import { checkTargetName } from "../../targets/registry.js";

export async function syncCommand(options: {
  target?: string;
  dryRun?: boolean;
  all?: boolean;
}): Promise<void> {
  if (!checkTargetName(options.target)) return;
  const config = await loadConfig();
  const dryRun = options.dryRun ?? false;

  if (dryRun) {
    console.log(chalk.dim("  [dry run]"));
  }

  if (options.target) {
    const result = await syncTarget(
      config,
      options.target as TargetName,
      dryRun
    );
    printSyncResult(result.target, result);
  } else {
    const results = await syncAll(config, dryRun);
    for (const result of results) {
      printSyncResult(result.target, result);
    }
  }
}

function printSyncResult(
  target: string,
  result: {
    added: string[];
    unmanaged: string[];
    skipped: Array<{ id: string; missing: string[] }>;
    updated: string[];
    unchanged: string[];
    backedUp: boolean;
    error?: string;
  }
): void {
  const hasChanges =
    result.added.length > 0 || result.updated.length > 0;

  for (const s of result.skipped) {
    console.log(
      chalk.red(`  ! ${target}: skipped ${s.id} — missing in .env: ${s.missing.join(", ")}`)
    );
  }

  if (result.error) {
    console.log(chalk.red(`  ✗ ${target}: ${result.error}`));
    return;
  }

  if (!hasChanges) {
    console.log(chalk.dim(`  ✓ ${target}: no changes`));
    return;
  }

  console.log(chalk.blue(`  → ${target}:`));
  if (result.backedUp) console.log(chalk.dim("    backed up"));
  for (const id of result.added) console.log(chalk.green(`    + ${id}`));
  for (const id of result.updated) console.log(chalk.yellow(`    ~ ${id}`));
  if (result.unmanaged.length > 0) {
    console.log(chalk.dim(`    = ${result.unmanaged.length} unmanaged server(s) kept`));
  }
}
