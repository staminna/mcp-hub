import { watch } from "fs";
import { basename, dirname } from "path";
import chalk from "chalk";
import { type HubConfig, type HealthResult, type McpServer, type SyncResult } from "../types.js";
import { HUB_CONFIG_PATH, HUB_ENV_PATH } from "../config/defaults.js";
import { loadConfig } from "../config/store.js";
import { validateConfig } from "../config/validate.js";
import { syncAll } from "./engine.js";
import { sameServer } from "../targets/base.js";
import { checkHealth } from "../health/checker.js";

const WATCHED = new Set([basename(HUB_CONFIG_PATH), basename(HUB_ENV_PATH)]);

/** Only these files trigger a sync (fs.watch may report no filename at all). */
export const isWatched = (file: string | Buffer | null) => WATCHED.has(String(file));

/**
 * - review: work out what a sync would change and say so; write nothing. You apply it
 *   from the dashboard's Changes page or `mcp-hub sync`, as before.
 * - auto: sync right away, but only once the config validates.
 * Either way, every server a sync would add or change is health-checked first, so a
 * rejected token (HTTP 401) or a command that won't start shows up before it's written.
 * In auto mode those servers are held back: editors keep what they had.
 */
export type WatchMode = "review" | "auto";

/** One line per sync: only targets where something changed, or that failed. */
export function summarize(results: SyncResult[]): string {
  const parts = results
    .filter((r) => r.error || r.added.length || r.updated.length || r.skipped.length)
    .map((r) => {
      if (r.error) return chalk.red(`${r.target} ✗ ${r.error}`);
      const bits = [
        r.added.length && `+${r.added.length}`,
        r.updated.length && `~${r.updated.length}`,
        r.skipped.length && `${r.skipped.length} held back (missing in .env)`,
      ].filter(Boolean);
      return `${r.target} ${bits.join(" ")}`;
    });
  return parts.length ? parts.join(", ") : "no changes";
}

const pending = (results: SyncResult[]) => results.some((r) => r.added.length || r.updated.length);

/** Hub servers a sync would add or change in at least one editor */
function changedServers(config: HubConfig, results: SyncResult[]): McpServer[] {
  const keys = results.flatMap((r) => [...r.added, ...r.updated]);
  return config.servers.filter((s) => keys.some((k) => sameServer(k, s.id)));
}

const describeHealth = (results: HealthResult[]) =>
  results.map((h) => (h.status === "healthy" ? chalk.green(`${h.serverId} ✓`) : chalk.red(`${h.serverId} ✗ ${h.error ?? h.status}`))).join(", ");

/**
 * React to edits of mcp-hub.json or .env. Watches the directory, not the files:
 * editors and saveConfig replace files, which ends a file watch.
 * Returns a function that stops watching.
 */
export function watchConfig({
  mode = "review",
  reviewAt = "the Changes page",
  debounceMs = 500,
  load = () => loadConfig(),
  sync = syncAll,
  health = (s: McpServer) => checkHealth(s),
  log = (m: string) => console.log(m),
}: {
  mode?: WatchMode;
  /** Where to look at pending changes, e.g. the dashboard's #/diff URL */
  reviewAt?: string;
  debounceMs?: number;
  load?: () => Promise<HubConfig>;
  sync?: (config: HubConfig, dryRun: boolean) => Promise<SyncResult[]>;
  health?: (server: McpServer) => Promise<HealthResult>;
  log?: (m: string) => void;
} = {}): () => void {
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let again = false;

  const check = async () => {
    const config = await load();
    const problems = validateConfig(config);
    if (mode === "auto" && problems.length > 0) {
      log(chalk.yellow(`  config changed, not synced: fix mcp-hub.json first\n    ${problems.join("\n    ")}`));
      return;
    }
    // Always look first: what would change, and do the changed servers actually work?
    const preview = await sync(config, true);
    if (!pending(preview)) return log(chalk.dim(`  config changed: editors already match`));
    const checks = await Promise.all(changedServers(config, preview).map(health));
    const failing = new Set(checks.filter((h) => h.status !== "healthy").map((h) => h.serverId));
    const healthLine = checks.length ? `\n    health: ${describeHealth(checks)}` : "";

    if (mode === "review") {
      const warn = problems.length ? chalk.yellow(`\n    looks unfinished: ${problems.join("; ")}`) : "";
      return log(`  config changed, not written yet: ${summarize(preview)}${healthLine}\n    review on ${reviewAt}, then sync there or run mcp-hub sync${warn}`);
    }

    // auto: write everything except servers that failed their check (sync never removes,
    // so leaving them out of the config keeps the editors' current entries)
    const held = failing.size ? chalk.yellow(`\n    held back (failed health check): ${[...failing].join(", ")}`) : "";
    const healthy = { ...config, servers: config.servers.filter((s) => !failing.has(s.id)) };
    if (failing.size && !pending(await sync(healthy, true))) {
      return log(`  config changed, nothing synced${healthLine}${held}`);
    }
    log(chalk.dim(`  config changed, synced: ${summarize(await sync(healthy, false))}`) + healthLine + held);
  };

  const run = async () => {
    if (running) { again = true; return; } // a change landed mid-check: check once more after
    running = true;
    try {
      await check();
    } catch (err) {
      // e.g. half-saved JSON: report it and wait for the next save
      log(chalk.yellow(`  config changed but couldn't be read: ${err instanceof Error ? err.message : String(err)}`));
    } finally {
      running = false;
      if (again) { again = false; void run(); }
    }
  };

  const watcher = watch(dirname(HUB_CONFIG_PATH), (_event, file) => {
    if (!isWatched(file)) return;
    clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  });

  return () => { clearTimeout(timer); watcher.close(); };
}
