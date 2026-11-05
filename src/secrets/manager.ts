import { type HubConfig, type McpServer } from "../types.js";

/**
 * Resolve ${VAR} references in a server's env values and args.
 * Returns the resolved server plus any variable names that couldn't be found —
 * callers must not write a server with missing vars (it would get a literal
 * "${VAR}" placeholder instead of the real secret).
 */
export function resolveServer(
  server: McpServer,
  envFile: Record<string, string>
): { server: McpServer; missing: string[] } {
  const missing = new Set<string>();
  const resolve = (value: string) =>
    value.replace(/\$\{([^}]+)\}/g, (ref, varName: string) => {
      const v = envFile[varName] ?? process.env[varName];
      if (v === undefined || v === "") {
        missing.add(varName);
        return ref;
      }
      return v;
    });

  const resolved: McpServer = { ...server };
  if (server.env) {
    resolved.env = Object.fromEntries(
      Object.entries(server.env).map(([k, v]) => [k, resolve(v)])
    );
  }
  if (server.args) resolved.args = server.args.map(resolve);
  return { server: resolved, missing: [...missing] };
}

/** Detect literal tokens in server env that should be extracted to .env */
export function detectSecrets(
  server: McpServer
): Array<{ key: string; value: string }> {
  if (!server.env) return [];

  const secrets: Array<{ key: string; value: string }> = [];

  for (const [key, value] of Object.entries(server.env)) {
    // Skip values that are already variable references. (Not VAR_PATTERN.test:
    // a /g regex keeps lastIndex between calls and gives alternating results.)
    if (value.includes("${")) continue;
    // Paths and URLs aren't secrets (e.g. KUBECONFIG=/Users/me/.kube/config)
    if (/^(\/|~|\.\/|https?:\/\/)/.test(value)) continue;
    // Booleans, numbers, short flags
    if (value.length < 8) continue;

    // Heuristic: long alphanumeric strings, or keys containing TOKEN/KEY/SECRET/PASSWORD
    const isSecretKey =
      /token|key|secret|password|api_key|apikey|auth/i.test(key);
    const isLongValue = value.length > 20 && /^[A-Za-z0-9_\-+=/.]+$/.test(value);

    if (isSecretKey || isLongValue) {
      secrets.push({ key, value });
    }
  }

  return secrets;
}

/** Extract detected secrets from server env into ${VAR} references */
export function extractSecrets(
  config: HubConfig
): {
  config: HubConfig;
  extracted: Record<string, string>;
} {
  const extracted: Record<string, string> = {};
  const servers = config.servers.map((server) => {
    if (!server.env) return server;

    const secrets = detectSecrets(server);
    if (secrets.length === 0) return server;

    const newEnv = { ...server.env };
    for (const { key, value } of secrets) {
      const envVarName = `${server.id.toUpperCase().replace(/-/g, "_")}_${key}`;
      extracted[envVarName] = value;
      newEnv[key] = `\${${envVarName}}`;
    }

    return { ...server, env: newEnv };
  });

  return { config: { ...config, servers }, extracted };
}

export interface SecretVar {
  name: string;
  /** Where the value comes from at sync time, or "missing". Never the value itself. */
  source: "env-file" | "environment" | "missing";
  /** Hub servers whose env or args reference ${name}. */
  usedBy: string[];
}

export const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Every ${VAR} the hub references plus every key in .env — names and status only. */
export function listSecretVars(config: HubConfig, envFile: Record<string, string>): SecretVar[] {
  const usedBy = new Map<string, Set<string>>();
  for (const s of config.servers) {
    for (const v of [...Object.values(s.env ?? {}), ...(s.args ?? [])]) {
      for (const [, name] of v.matchAll(/\$\{([^}]+)\}/g)) {
        if (!usedBy.has(name)) usedBy.set(name, new Set());
        usedBy.get(name)!.add(s.id);
      }
    }
  }
  const names = new Set([...usedBy.keys(), ...Object.keys(envFile)]);
  return [...names].sort().map((name) => ({
    name,
    source: envFile[name] ? "env-file" : process.env[name] ? "environment" : "missing",
    usedBy: [...(usedBy.get(name) ?? [])].sort(),
  }));
}
