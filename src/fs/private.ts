import { writeFile, rename, mkdir, stat, chmod, rm, lstat, realpath } from "fs/promises";
import { dirname } from "path";

/**
 * Write a file that may hold secrets (editor configs, .env, backups).
 *
 * - An existing file keeps its permissions; a new one is created 0600, and
 *   missing folders 0700. (A plain tmp+rename would reset a private file to 644.)
 * - A symlink is written through to its target, not replaced by a regular file.
 * - Atomic: written to a tmp file next to the target, then renamed over it.
 */
export async function writeFilePrivate(path: string, content: string): Promise<void> {
  let target = path;
  let mode = 0o600;
  try {
    if ((await lstat(path)).isSymbolicLink()) target = await realpath(path);
    mode = (await stat(target)).mode & 0o777;
  } catch {
    // doesn't exist yet: create it private
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, content, { encoding: "utf-8", mode });
    await chmod(tmp, mode); // writeFile's mode is reduced by the umask
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
