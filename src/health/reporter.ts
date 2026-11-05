import { type HealthResult } from "../types.js";

export function formatHealthResults(results: HealthResult[]): string {
  const lines: string[] = [];

  for (const r of results) {
    const icon =
      r.status === "healthy" ? "✓" : r.status === "unhealthy" ? "✗" : "?";
    const time = r.responseTimeMs ? ` (${r.responseTimeMs}ms)` : "";
    const error = r.error ? ` — ${r.error}` : "";
    lines.push(`  ${icon} ${r.serverId}${time}${error}`);
  }

  const healthy = results.filter((r) => r.status === "healthy").length;
  const total = results.length;
  lines.push(`\n  ${healthy}/${total} healthy`);

  return lines.join("\n");
}
