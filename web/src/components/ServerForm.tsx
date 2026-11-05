import { useState, type FormEvent } from "react";
import type { McpServer, TargetInfo, TargetName } from "../api.ts";
import { Spinner } from "./ui.tsx";

type Transport = McpServer["transport"];

interface FormState {
  name: string;
  description: string;
  transport: Transport;
  command: string;
  args: string;
  cwd: string;
  url: string;
  env: string;
  tags: string;
  allTargets: boolean;
  targets: TargetName[];
}

function toForm(s?: Partial<McpServer>): FormState {
  return {
    name: s?.name ?? "",
    description: s?.description ?? "",
    transport: s?.transport ?? "stdio",
    command: s?.command ?? "",
    args: (s?.args ?? []).join("\n"),
    cwd: s?.cwd ?? "",
    url: s?.url ?? "",
    env: Object.entries(s?.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"),
    tags: (s?.tags ?? []).join(", "),
    allTargets: s?.targets === "*",
    targets: s?.targets && s.targets !== "*" ? s.targets : [],
  };
}

function parseEnv(raw: string): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return Object.keys(env).length ? env : undefined;
}

function fromForm(f: FormState): Partial<McpServer> & { name: string } {
  const stdio = f.transport === "stdio";
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  return {
    name: f.name.trim(),
    description: f.description.trim() || undefined,
    transport: f.transport,
    command: stdio ? f.command.trim() : undefined,
    args: stdio ? lines(f.args) : undefined,
    cwd: stdio ? f.cwd.trim() || undefined : undefined,
    url: stdio ? undefined : f.url.trim(),
    env: parseEnv(f.env),
    tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
    targets: f.allTargets ? "*" : f.targets,
  };
}

export function ServerForm({
  initial,
  targets,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<McpServer>;
  targets: TargetInfo[];
  submitLabel: string;
  onSubmit: (s: Partial<McpServer> & { name: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(() => toForm(initial));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const stdio = f.transport === "stdio";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setProblem("Give the server a name.");
    if (stdio && !f.command.trim()) return setProblem("A stdio server needs a command, for example npx.");
    if (!stdio && !f.url.trim()) return setProblem("A remote server needs a URL.");
    setProblem(null);
    setBusy(true);
    try {
      await onSubmit(fromForm(f));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="filesystem" autoFocus={!initial} />
        </label>
        <label className="field">
          <span>Transport</span>
          <select value={f.transport} onChange={(e) => set("transport", e.target.value as Transport)}>
            <option value="stdio">stdio: run a local command</option>
            <option value="streamable-http">HTTP: remote endpoint</option>
            <option value="sse">SSE: remote endpoint (legacy)</option>
          </select>
        </label>
        <label className="field span-2">
          <span>Description</span>
          <input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional" />
        </label>

        {stdio ? (
          <>
            <label className="field">
              <span>Command</span>
              <input className="mono" value={f.command} onChange={(e) => set("command", e.target.value)} placeholder="npx" />
            </label>
            <label className="field">
              <span>Working directory</span>
              <input className="mono" value={f.cwd} onChange={(e) => set("cwd", e.target.value)} placeholder="Optional" />
            </label>
            <label className="field span-2">
              <span>Arguments, one per line</span>
              <textarea className="mono" rows={Math.min(10, Math.max(3, f.args.split("\n").length + 1))} value={f.args} onChange={(e) => set("args", e.target.value)}
                placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/tmp"} />
            </label>
          </>
        ) : (
          <label className="field span-2">
            <span>URL</span>
            <input className="mono" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com/mcp" />
          </label>
        )}

        <label className="field span-2">
          <span>Environment, one KEY=value per line</span>
          <textarea className="mono" rows={Math.min(12, Math.max(3, f.env.split("\n").length + 1))} value={f.env} onChange={(e) => set("env", e.target.value)}
            placeholder={"GITHUB_TOKEN=${GITHUB_TOKEN}"} />
          <small>Write secrets as <code>{"${VAR}"}</code> and put the value in <code>.env</code>. Sync fills them in and skips the server if one is missing.</small>
        </label>

        <label className="field span-2">
          <span>Tags, comma-separated</span>
          <input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="storage, official" />
        </label>

        <fieldset className="field span-2">
          <legend>Sync to</legend>
          <div className="checks">
            <label className="check">
              <input type="checkbox" checked={f.allTargets} onChange={(e) => set("allTargets", e.target.checked)} />
              Every editor
            </label>
            {targets.map((t) => (
              <label key={t.name} className={`check${f.allTargets ? " muted" : ""}`}>
                <input
                  type="checkbox"
                  disabled={f.allTargets}
                  checked={f.allTargets || f.targets.includes(t.name)}
                  onChange={(e) =>
                    set("targets", e.target.checked ? [...f.targets, t.name] : f.targets.filter((x) => x !== t.name))
                  }
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {problem && <p className="form-problem" role="alert">{problem}</p>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <Spinner />} {submitLabel}
        </button>
      </div>
    </form>
  );
}
