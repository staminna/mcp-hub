import type { McpServer } from "./api.ts";

export type PastedServer = Partial<McpServer> & { name: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const looksLikeServer = (v: unknown) => isObj(v) && ("command" in v || "url" in v || "serverUrl" in v || "httpUrl" in v);
const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);

function parseJson(text: string): unknown {
  // Snippets copied out of a bigger file often end in a comma or have one before a brace
  const clean = text.trim().replace(/,\s*([}\]])/g, "$1").replace(/,\s*$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    // A bare entry: "name": { ... }
    try {
      return JSON.parse(`{${clean}}`);
    } catch (err) {
      throw new Error(`That isn't valid JSON: ${(err as Error).message}`);
    }
  }
}

function toServer(name: string, raw: Record<string, unknown>): PastedServer {
  const url = (raw.url ?? raw.serverUrl ?? raw.httpUrl) as string | undefined;
  const env = isObj(raw.env) ? Object.fromEntries(Object.entries(raw.env).map(([k, v]) => [k, String(v)])) : undefined;
  const common = { name, env, disabled: raw.disabled === true ? true : undefined, targets: "*" as const };
  if (typeof raw.command === "string") {
    return {
      ...common,
      transport: "stdio",
      command: raw.command,
      args: strings(raw.args),
      cwd: typeof raw.cwd === "string" ? raw.cwd : undefined,
    };
  }
  if (typeof url === "string") {
    return { ...common, transport: raw.type === "sse" || raw.transport === "sse" ? "sse" : "streamable-http", url };
  }
  throw new Error(`"${name}" has neither a command nor a url.`);
}

/**
 * Servers from a pasted editor config: a bare `"name": {...}` entry, `{ "name": {...} }`,
 * a whole `{ "mcpServers": {...} }` file (VS Code's `servers` too), or one unnamed `{ "command": ... }`.
 */
export function parsePastedServers(text: string): PastedServer[] {
  if (!text.trim()) throw new Error("Paste a server config first.");
  const parsed = parseJson(text);
  if (!isObj(parsed)) throw new Error("Expected a JSON object.");
  if (looksLikeServer(parsed)) return [toServer("", parsed)]; // unnamed: the form asks for a name

  const map = [parsed.mcpServers, parsed.servers, isObj(parsed.mcp) ? parsed.mcp.servers : undefined].find(isObj) ?? parsed;
  const entries = Object.entries(map).filter(([, v]) => isObj(v));
  if (entries.length === 0) throw new Error("No servers found in that JSON.");
  return entries.map(([name, v]) => toServer(name, v as Record<string, unknown>));
}
