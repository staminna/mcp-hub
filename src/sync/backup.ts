import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { type TargetName } from "../types.js";

export async function createBackup(
  targetName: TargetName,
  configPath: string,
  backupDir: string
): Promise<string | null> {
  if (!existsSync(configPath)) return null;

  const targetDir = join(backupDir, targetName);
  if (!existsSync(targetDir)) {
    await mkdir(targetDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = configPath.endsWith(".yaml") || configPath.endsWith(".yml") ? ".yaml" : ".json";
  const backupPath = join(targetDir, `${timestamp}${ext}`);

  const content = await readFile(configPath, "utf-8");
  await writeFile(backupPath, content, "utf-8");

  return backupPath;
}
