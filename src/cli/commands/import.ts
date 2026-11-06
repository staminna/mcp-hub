import chalk from "chalk";
import { type McpServer, type TargetName } from "../../types.js";
import { loadConfig, saveConfig, slugify } from "../../config/store.js";
import { getAdapter, getAllAdapters, checkTargetName } from "../../targets/registry.js";
import { extractSecrets } from "../../secrets/manager.js";
import { loadEnvFile, saveEnvFile } from "../../secrets/env-file.js";
import { ClaudeCodeAdapter } from "../../targets/claude-code.js";

export async function importCommand(options: {
  from?: string;
  all?: boolean;
}): Promise<void> {
  if (!checkTargetName(options.from)) return;
  const config = await loadConfig();
  // --all is the default; --from narrows it to one editor
  const adapters = options.from ? [getAdapter(options.from as TargetName)] : getAllAdapters();

  const imported: McpServer[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let linked = 0;

  for (const adapter of adapters) {
    if (!adapter.exists()) {
      console.log(chalk.dim(`  skip ${adapter.config.displayName} (not found)`));
      continue;
    }

    console.log(chalk.blue(`  ← ${adapter.config.displayName}`));

    try {
      const servers = await adapter.read();
      for (const [id, serialized] of servers) {
        const slug = slugify(id);
        const existing = [...config.servers, ...imported].find((s) => s.id === slug);

        if (existing) {
          // Already in the hub from another editor: record that this editor has it too
          if (existing.targets !== "*" && !existing.targets.includes(adapter.name)) {
            existing.targets = [...existing.targets, adapter.name];
            console.log(chalk.cyan(`    ~ ${id} (already in the hub; now also synced here)`));
            linked++;
            continue;
          }
          console.log(chalk.dim(`    skip ${id} (already exists)`));
          totalSkipped++;
          continue;
        }

        const partial = adapter.fromSerializedServer(slug, serialized);
        const server: McpServer = {
          id: slug,
          name: id,
          transport: partial.transport ?? "stdio",
          command: partial.command,
          args: partial.args,
          cwd: partial.cwd,
          url: partial.url,
          env: partial.env,
          tags: [],
          disabled: !!partial.disabled,
          disabledTools: partial.disabledTools,
          targets: [adapter.name],
        };

        imported.push(server);
        console.log(chalk.green(`    + ${id}`));
        totalImported++;
      }
    } catch (err) {
      console.log(
        chalk.red(
          `    error: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (totalImported > 0) {
    // Keep secrets out of mcp-hub.json (it's committed): move them to .env
    // and leave ${VAR} references behind. Only new servers are touched.
    const { config: clean, extracted } = extractSecrets({ ...config, servers: imported });
    const names = Object.keys(extracted);
    if (names.length > 0) {
      await saveEnvFile({ ...(await loadEnvFile()), ...extracted });
      console.log(chalk.dim(`  moved ${names.length} secret(s) to .env: ${names.join(", ")}`));
    }
    config.servers.push(...clean.servers);
  }
  if (totalImported > 0 || linked > 0) await saveConfig(config);

  console.log(
    `\n  ${chalk.green(`${totalImported} imported`)}, ${linked > 0 ? chalk.cyan(`${linked} linked to more editors`) + ", " : ""}${chalk.dim(`${totalSkipped} skipped`)}`
  );

  // Claude Code's project-scoped servers aren't imported; say so instead of silently missing them
  const claude = adapters.find((a): a is ClaudeCodeAdapter => a instanceof ClaudeCodeAdapter);
  const local = (await claude?.projectServers().catch(() => []) ?? [])
    .filter((p) => !config.servers.some((s) => s.id === slugify(p.id)));
  if (local.length > 0) {
    console.log(chalk.yellow(`  ${local.length} project-scoped Claude Code server(s) not imported: ` +
      local.map((p) => `${p.id} (${p.project})`).join(", ")));
    console.log(chalk.dim("  They'd become user-wide in the hub. Add one on purpose with: mcp-hub add <name> --url … or the dashboard's paste box"));
  }
}
