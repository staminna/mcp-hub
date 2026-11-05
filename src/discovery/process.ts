import { exec } from "child_process";
import { promisify } from "util";
import { type DiscoveryResult } from "../types.js";

const execAsync = promisify(exec);

/**
 * Hide secrets in a command line: values of --*key/token/secret/password*
 * flags or KEY=value pairs, and long opaque strings that look like tokens.
 */
export function redact(command: string): string {
  return command
    .replace(/((?:--?|\b)[\w-]*(?:key|token|secret|password|auth)[\w-]*[=\s])("[^"]*"|'[^']*'|\S+)/gi, "$1•••")
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, "•••");
}

export async function findRunningMcpProcesses(): Promise<DiscoveryResult[]> {
  try {
    const { stdout } = await execAsync("ps aux");
    const lines = stdout.split("\n");
    const results: DiscoveryResult[] = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.includes("mcp") &&
        !lower.includes("mcp-hub") &&
        !lower.includes("grep")
      ) {
        // Extract the command part
        const parts = line.trim().split(/\s+/);
        const command = redact(parts.slice(10).join(" "));
        if (command) {
          results.push({
            name: command.split("/").at(-1)!.split(" ")[0],
            source: "process",
            description: `Running process: ${command.substring(0, 100)}`,
            command: redact(parts[10]),
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}
