import chalk from "chalk";
import { type McpServer, type TargetName } from "../../types.js";
import { loadConfig, saveConfig, slugify } from "../../config/store.js";
import { getAdapter, getAllAdapters, checkTargetName } from "../../targets/registry.js";
import { extractSecrets } from "../../secrets/manager.js";
import { loadEnvFile, saveEnvFile } from "../../secrets/env-file.js";

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
    await saveConfig(config);
  }

  console.log(
    `\n  ${chalk.green(`${totalImported} imported`)}, ${chalk.dim(`${totalSkipped} skipped`)}`
  );
}
