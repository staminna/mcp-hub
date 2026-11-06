import { isTargetName } from "../targets/registry.js";

const TRANSPORTS = ["stdio", "sse", "streamable-http"];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Problems that would make a sync write something broken: one line each, empty when
 * the config is fine. Used to hold back a sync from a half-finished hand edit.
 */
export function validateConfig(config: unknown): string[] {
  if (!isObj(config) || !Array.isArray(config.servers)) return ["mcp-hub.json has no servers list"];
  const problems: string[] = [];
  const seen = new Set<string>();
  config.servers.forEach((s: unknown, i) => {
    if (!isObj(s)) return problems.push(`server #${i + 1} isn't an object`);
    const who = typeof s.id === "string" && s.id ? s.id : `server #${i + 1}`;
    const bad = (msg: string) => problems.push(`${who}: ${msg}`);
    if (typeof s.id !== "string" || !s.id) bad("missing id");
    else if (seen.has(s.id)) bad("duplicate id");
    else seen.add(s.id);
    if (typeof s.name !== "string" || !s.name) bad("missing name");
    if (!TRANSPORTS.includes(s.transport as string)) bad(`unknown transport ${JSON.stringify(s.transport)}`);
    else if (s.transport === "stdio") {
      if (typeof s.command !== "string" || !s.command.trim()) bad("stdio server needs a command");
    } else if (typeof s.url !== "string" || !URL.canParse(s.url)) bad("remote server needs a valid url");
    if (s.args !== undefined && !(Array.isArray(s.args) && s.args.every((a) => typeof a === "string"))) bad("args must be a list of strings");
    if (s.env !== undefined && !(isObj(s.env) && Object.values(s.env).every((v) => typeof v === "string"))) bad("env values must be strings");
    if (s.targets !== "*" && !(Array.isArray(s.targets) && s.targets.every((t) => typeof t === "string" && isTargetName(t)))) {
      bad(`targets must be "*" or a list of editors`);
    }
  });
  const off = isObj(config.settings) ? config.settings.disabledTargets : undefined;
  if (off !== undefined && !(Array.isArray(off) && off.every((t) => typeof t === "string" && isTargetName(t)))) {
    problems.push("settings.disabledTargets must be a list of editors");
  }
  return problems;
}
