import { readFile, mkdir, chmod } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { type TargetName } from "../types.js";
import { writeFilePrivate } from "../fs/private.js";

/**
 * Copy an editor config into <backupDir>/<target>/<timestamp>. Backups hold
 * real tokens, so the copy is 0600 and the folders are (re)set to 0700.
 */
export async function createBackup(
  targetName: TargetName,
  configPath: string,
  backupDir: string
): Promise<string | null> {
  if (!existsSync(configPath)) return null;

  const targetDir = join(backupDir, targetName);
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  await chmod(backupDir, 0o700);
  await chmod(targetDir, 0o700);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = configPath.endsWith(".yaml") || configPath.endsWith(".yml") ? ".yaml" : ".json";
  const backupPath = join(targetDir, `${timestamp}${ext}`);

  await writeFilePrivate(backupPath, await readFile(configPath, "utf-8"));
  return backupPath;
}
