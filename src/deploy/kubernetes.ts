import { exec } from "child_process";
import { promisify } from "util";
import { type HubConfig, type TargetName } from "../types.js";
import { getAdapter } from "../targets/registry.js";

const execAsync = promisify(exec);

export async function deployToK8s(
  config: HubConfig,
  targetName: TargetName,
  options: {
    context?: string;
    namespace?: string;
    configMapName?: string;
  } = {}
): Promise<string> {
  const adapter = getAdapter(targetName);
  const servers = config.servers.filter((s) => {
    if (s.disabled) return false;
    if (s.targets === "*") return true;
    return s.targets.includes(targetName);
  });

  const serialized = new Map();
  for (const server of servers) {
    serialized.set(server.id, adapter.toSerializedServer(server));
  }
  const content = adapter.serialize(serialized, "");

  const ns = options.namespace ?? "default";
  const name = options.configMapName ?? "mcp-config";
  const contextFlag = options.context ? `--context ${options.context}` : "";

  // Create or update ConfigMap
  const cmd = `kubectl ${contextFlag} -n ${ns} create configmap ${name} --from-literal=mcp-config='${content.replace(/'/g, "'\\''")}' --dry-run=client -o yaml | kubectl ${contextFlag} apply -f -`;

  const { stdout } = await execAsync(cmd);
  return `Deployed ${servers.length} servers to k8s ConfigMap ${ns}/${name}: ${stdout.trim()}`;
}
