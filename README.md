# MCP Hub

One list of MCP servers (`mcp-hub.json`) synced into every editor's config, plus a
dashboard for browsing and editing your skills and memories.

```bash
npm install
cp mcp-hub.example.json mcp-hub.json   # your server list (gitignored)
cp .env.example .env                   # your secrets (gitignored)
npm run dev -- <command>               # or: npm run build && node dist/index.js <command>
```

Already have servers in an editor? `npm run dev -- import --from claude-code` pulls them in
and moves any tokens it finds into `.env`.

## Commands

| Command | What it does |
|---|---|
| `list [--tag t] [--target ide] [--json]` | Servers in the hub |
| `add <name> …` / `remove` / `enable` / `disable` | Edit the hub |
| `diff [--target ide]` | What a sync would change (field names only, never values) |
| `sync [--target ide] [--dry-run]` | Write hub servers into editor configs |
| `import [--from ide]` | Pull servers from an editor config into the hub |
| `health [name]` | Start each server and check it answers MCP `initialize` |
| `discover --npm \| --running` | Find MCP servers |
| `skills list \| show <name>` | `~/.claude/skills`, `~/.gemini/skills` |
| `memories list [--project p] \| show <file>` | `~/.claude/projects/*/memory` |
| `serve [--port 3847]` | Web dashboard at http://localhost:3847 |

## Targets

`claude-code` (`~/.claude.json`, the file Claude Code reads), `claude-mcp`
(`~/.claude/mcp_config.json`), `claude-settings`, `vscode`, `windsurf`, `cursor`,
`gemini`, `docker`, `unity`. A server is synced only to the targets in its `targets` list.

## Safety rules (built in)

- **Sync never removes anything.** Servers in an editor's config that the hub doesn't
  manage are kept (`diff` shows them as "unmanaged"). Disabled hub servers are left as-is.
  To remove a server from an editor, edit that editor's config.
- **Secrets live in `.env`** (gitignored), referenced as `${VAR}` in `mcp-hub.json`
  (committed). Sync and health resolve them; a server with a missing var is **skipped**,
  never written with a placeholder. `import` moves detected secrets to `.env` automatically.
  See `.env.example` for the variable names.
- **Sync refuses to run from an empty hub** (e.g. `mcp-hub.json` not found).
- Every write is preceded by a backup in `~/.mcp-hub/backups` and done atomically.
- The Claude Code target only replaces the `mcpServers` key in `~/.claude.json` and
  refuses to write if it can't parse that file.
- Skills/memories: only existing `.md` files inside those folders can be edited.

The hub folder defaults to this project; override with `MCP_HUB_HOME`.
Always run `diff` before `sync`.
