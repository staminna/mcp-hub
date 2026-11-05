import { spawn } from "child_process";
import { stringify } from "yaml";
import { type HubConfig, type TargetName } from "../types.js";
import { getAdapter } from "../targets/registry.js";
import { getServersForTarget } from "../sync/engine.js";

/** Run a command with input on stdin (no shell, so nothing is interpolated). */
function run(cmd: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err.trim() || `${cmd} exited with ${code}`))
    );
    proc.stdin.end(input);
  });
}

/**
 * Apply the target's config as a Kubernetes Secret (it holds real tokens, so
 * not a ConfigMap). The manifest goes to kubectl on stdin, so the tokens never
 * appear in the process list. Mount it with `volumes[].secret.secretName`.
 */
export async function deployToK8s(
  config: HubConfig,
  targetName: TargetName,
  options: { context?: string; namespace?: string; configMapName?: string } = {}
): Promise<string> {
  const adapter = getAdapter(targetName);
  const { servers, skipped } = await getServersForTarget(config, targetName);
  const serialized = new Map(servers.map((s) => [s.id, adapter.toSerializedServer(s)]));
  const content = adapter.serialize(serialized, "");

  const ns = options.namespace ?? "default";
  const name = options.configMapName ?? "mcp-config";
  const manifest = stringify({
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: { name, namespace: ns },
    stringData: { "mcp-config": content },
  });
  const args = [...(options.context ? ["--context", options.context] : []), "apply", "-f", "-"];

  const stdout = await run("kubectl", args, manifest);
  const held = skipped.length ? ` (skipped, missing in .env: ${skipped.map((s) => s.id).join(", ")})` : "";
  return `Deployed ${servers.length} servers to k8s Secret ${ns}/${name}${held}: ${stdout.trim()}`;
}
