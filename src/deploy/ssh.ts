import { homedir } from "os";
import { type HubConfig, type TargetName } from "../types.js";
import { getAdapter } from "../targets/registry.js";
import { getServersForTarget } from "../sync/engine.js";

/** Single-quote a value for a POSIX shell. */
const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Merge the hub's servers into a target's config on a remote machine.
 * Like sync, it never removes anything: the remote file is read first and
 * only the hub's servers are added or updated.
 */
export async function deployViaSSH(
  config: HubConfig,
  targetName: TargetName,
  host: string,
  options: { keyPath?: string; username?: string } = {}
): Promise<string> {
  const { NodeSSH } = await import("node-ssh");
  const ssh = new NodeSSH();
  const adapter = getAdapter(targetName);
  const { servers, skipped } = await getServersForTarget(config, targetName);
  const username = options.username ?? process.env.USER ?? "root";
  const remoteHome = username === "root" ? "/root" : `/home/${username}`;
  const remotePath = adapter.configPath.replace(homedir(), remoteHome);

  try {
    await ssh.connect({ host, username, privateKeyPath: options.keyPath });

    const current = await ssh.execCommand(`cat ${sh(remotePath)}`);
    const existingRaw = current.code === 0 ? current.stdout : "";
    const merged = existingRaw ? adapter.deserialize(existingRaw) : new Map();
    for (const s of servers) merged.set(s.id, adapter.toSerializedServer(s));
    const content = adapter.serialize(merged, existingRaw);

    const dir = remotePath.slice(0, remotePath.lastIndexOf("/"));
    const write = await ssh.execCommand(
      `mkdir -p ${sh(dir)} && cat > ${sh(remotePath + ".tmp")} && mv ${sh(remotePath + ".tmp")} ${sh(remotePath)}`,
      { stdin: content }
    );
    if (write.code !== 0) throw new Error(write.stderr || `remote write failed (exit ${write.code})`);

    const held = skipped.length ? ` (skipped, missing in .env: ${skipped.map((s) => s.id).join(", ")})` : "";
    return `Deployed ${servers.length} servers to ${host}:${remotePath}${held}`;
  } finally {
    ssh.dispose();
  }
}
