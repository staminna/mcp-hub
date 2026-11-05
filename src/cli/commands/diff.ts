import chalk from "chalk";
import { type TargetName } from "../../types.js";
import { loadConfig } from "../../config/store.js";
import { computeDiff } from "../../sync/diff.js";
import { getServersForTarget } from "../../sync/engine.js";
import { getTargetNames, checkTargetName } from "../../targets/registry.js";

export async function diffCommand(options: {
  target?: string;
}): Promise<void> {
  if (!checkTargetName(options.target)) return;
  const config = await loadConfig();

  const targets = options.target
    ? [options.target as TargetName]
    : getTargetNames();

  for (const target of targets) {
    const { servers, skipped } = await getServersForTarget(config, target);
    for (const sk of skipped) {
      console.log(
        chalk.red(`  ! ${target}: ${sk.id} would be skipped — missing in .env: ${sk.missing.join(", ")}`)
      );
    }

    let all;
    try {
      all = await computeDiff(target, servers);
    } catch (err) {
      // One unreadable editor config shouldn't hide the others
      console.log(chalk.red(`  ✗ ${target}: ${(err as Error).message}`));
      continue;
    }
    // A skipped server still in the IDE config is held back, not "unmanaged"
    const diffs = all.filter(
      (d) => !(d.action === "unmanaged" && skipped.some((sk) => sk.id === d.serverId))
    );
    const changes = diffs.filter(
      (d) => d.action === "add" || d.action === "update"
    );

    if (changes.length === 0) {
      console.log(chalk.dim(`  ${target}: in sync`));
      continue;
    }

    console.log(chalk.blue(`  ${target}:`));
    for (const d of diffs) {
      switch (d.action) {
        case "add":
          console.log(chalk.green(`    + ${d.serverId}`));
          break;
        case "unmanaged":
          console.log(chalk.dim(`    = ${d.serverId} (unmanaged here, kept)`));
          break;
        case "update":
          console.log(chalk.yellow(`    ~ ${d.serverId}`));
          if (d.before && d.after) {
            // Field names only — values may be secrets
            console.log(chalk.dim(`      changed: ${changedFields(d.before, d.after).join(", ")}`));
          }
          break;
      }
    }
  }
}

/** Top-level keys that differ, with env broken out per variable (e.g. "env.TOKEN"). */
function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[k], a = after[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    if (k === "env" && b && a && typeof b === "object" && typeof a === "object") {
      const be = b as Record<string, unknown>, ae = a as Record<string, unknown>;
      for (const e of new Set([...Object.keys(be), ...Object.keys(ae)])) {
        if (be[e] !== ae[e]) out.push(`env.${e}${e in be ? (e in ae ? "" : " (removed)") : " (new)"}`);
      }
    } else {
      out.push(k);
    }
  }
  return out;
}
