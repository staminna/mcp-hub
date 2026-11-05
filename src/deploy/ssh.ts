import { type HubConfig, type TargetName } from "../types.js";
import { getAdapter } from "../targets/registry.js";

export async function deployViaSSH(
  config: HubConfig,
  targetName: TargetName,
  host: string,
  options: { keyPath?: string; username?: string } = {}
): Promise<string> {
  const { NodeSSH } = await import("node-ssh");
  const ssh = new NodeSSH();

  const adapter = getAdapter(targetName);
  const servers = config.servers.filter((s) => {
    if (s.disabled) return false;
    if (s.targets === "*") return true;
    return s.targets.includes(targetName);
  });

  // Generate the config content
  const serialized = new Map();
  for (const server of servers) {
    serialized.set(server.id, adapter.toSerializedServer(server));
  }
  const content = adapter.serialize(serialized, "");

  try {
    await ssh.connect({
      host,
      username: options.username ?? process.env.USER ?? "root",
      privateKeyPath: options.keyPath,
    });

    // Upload config
    const remotePath = adapter.configPath.replace(
      process.env.HOME ?? "",
      `/home/${options.username ?? process.env.USER}`
    );
    await ssh.execCommand(`mkdir -p $(dirname ${remotePath})`);
    await ssh.execCommand(`cat > ${remotePath} << 'MCPHUBEOF'\n${content}\nMCPHUBEOF`);

    ssh.dispose();
    return `Deployed ${servers.length} servers to ${host}:${remotePath}`;
  } catch (err) {
    ssh.dispose();
    throw err;
  }
}
