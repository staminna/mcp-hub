import chalk from "chalk";
import { homedir } from "os";
import { type TargetName } from "../../types.js";
import { loadConfig, saveConfig, setTargetEnabled } from "../../config/store.js";
import { getAllAdapters, checkTargetName, isTargetEnabled } from "../../targets/registry.js";

export async function targetsListCommand(): Promise<void> {
  const config = await loadConfig();
  for (const a of getAllAdapters()) {
    const on = isTargetEnabled(config, a.name);
    const path = a.configPath.replace(homedir(), "~") + (a.exists() ? "" : " (not found)");
    const line = `  ${on ? "●" : "○"} ${a.name.padEnd(16)} ${path}`;
    console.log(on ? line : chalk.dim(line));
  }
}

async function toggle(name: string, enabled: boolean): Promise<void> {
  if (!checkTargetName(name)) return;
  const config = setTargetEnabled(await loadConfig(), name as TargetName, enabled);
  await saveConfig(config);
  console.log(enabled ? chalk.green(`  ● ${name} on — sync will write to it`) : chalk.dim(`  ○ ${name} off — sync will skip it`));
}

export const targetsEnableCommand = (name: string) => toggle(name, true);
export const targetsDisableCommand = (name: string) => toggle(name, false);
