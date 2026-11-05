import { exec } from "child_process";
import { promisify } from "util";
import { type DiscoveryResult } from "../types.js";

const execAsync = promisify(exec);

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
        const command = parts.slice(10).join(" ");
        if (command) {
          results.push({
            name: command.split("/").pop()?.split(" ")[0] ?? "unknown",
            source: "process",
            description: `Running process: ${command.substring(0, 100)}`,
            command: parts[10],
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}
