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

## Dashboard

```bash
npm run build              # builds the CLI and the dashboard (web/ → dist/web)
npm run dev -- serve       # http://localhost:3847
```

For working on the dashboard itself, run `npm run dev -- serve` in one terminal and
`npm run dev:web` in another, then open http://localhost:5173 (hot reload; `/api` is
proxied to the hub). It's a Vite + React + TypeScript app in `web/` that shares
`src/types.ts` with the backend; `npm run typecheck:web` checks it.

Pages: **Servers** (which server goes to which editor, health, on/off), **Changes**
(what a sync would do, field names only), **Editors** (sync, with a confirm step),
**Secrets** (set, replace or remove the tokens in `.env` without editing the file),
**Skills** and **Memories** (read and edit in place), **Import** and **Find servers**.

The dashboard listens on `127.0.0.1` only (`--host` to change that, with a warning),
rejects requests for other host names, and refuses changes coming from other websites.

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
- Sync only replaces the server list in an editor's file. Every other key (Claude Code's
  state in `~/.claude.json`, `permissions` in Claude settings, Gemini's `ui`…) is kept,
  and a file that can't be parsed is never written. Docker's own per-server
  `config.yaml` (no server list) is left alone.
- `deploy` (SSH or Kubernetes) merges the same way, fills in `${VAR}` values, and skips
  servers with missing vars. Kubernetes gets a **Secret** (not a ConfigMap), sent to
  `kubectl` on stdin; mount it with `volumes[].secret.secretName`.
- **Tokens stay private.** New editor configs, `.env` and backups are created `0600`
  (folders `0700`); existing files keep their permissions; symlinks are written through.
  Secrets are write-only in the dashboard: names and status go out, values never do, and
  the Changes page gets field names only.
- Skills/memories: only existing `.md` files inside those folders can be edited.

## Tests

```bash
npm test                # 301 tests (backend + dashboard)
npm run test:coverage   # same, with coverage; fails below 95% on any metric
```

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 100% | 99.1% | 100% | 100% |

Coverage includes the CLI, API server, sync, adapters, health, discovery, deploy and the
dashboard (`web/`, run in jsdom). Tests never touch your real configs:
`tests/setup.ts` points `HOME` and the hub folder at a fresh temp folder before any code
loads, and `tests/isolation.test.ts` fails the run if any path escapes it. SSH, kubectl
and npm are faked; health checks start real `node` processes and a local HTTP server.
The HTML report is written to `coverage/`.

The hub folder defaults to this project; override with `MCP_HUB_HOME`.
Always run `diff` before `sync`.
