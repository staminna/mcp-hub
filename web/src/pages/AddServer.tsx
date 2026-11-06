import { api } from "../api.ts";
import { navigate } from "../router.ts";
import { useToast } from "../toast.tsx";
import { useApi } from "../useApi.ts";
import { ServerForm } from "../components/ServerForm.tsx";
import { Loading, PageHeader, Spinner } from "../components/ui.tsx";
import { takePrefill } from "../prefill.ts";
import { parsePastedServers, type PastedServer } from "../pasteConfig.ts";
import { useState } from "react";

/** Paste an editor's JSON: one server fills the form below, several can be added in one go. */
function PasteBox({ onOne }: { onOne: (s: PastedServer) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [many, setMany] = useState<PastedServer[] | null>(null);
  const [busy, setBusy] = useState(false);

  const read = () => {
    setMany(null);
    try {
      const servers = parsePastedServers(text);
      setProblem(null);
      if (servers.length === 1) onOne(servers[0]);
      else setMany(servers);
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  const addAll = async (servers: PastedServer[]) => {
    setBusy(true);
    const failed: string[] = [];
    for (const s of servers) {
      try {
        await api.createServer(s);
      } catch (err) {
        failed.push(`${s.name}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    if (failed.length) toast.error(`Couldn't add ${failed.length} of ${servers.length}`, failed.join("; "));
    else {
      toast.success(`Added ${servers.length} servers`, servers.map((s) => s.name).join(", "));
      navigate("#/");
    }
  };

  return (
    <div className="panel paste-box">
      <label className="field">
        <span>Paste a config</span>
        <textarea className="mono" rows={5} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'"filesystem": {\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]\n}'} />
        <small>
          An entry from any editor's MCP config, or the whole <code>mcpServers</code> block. One server fills the form
          below so you can check it; tokens in <code>env</code> are moved to <code>.env</code> when you add it.
        </small>
      </label>
      {problem && <p className="form-problem" role="alert">{problem}</p>}
      <div className="form-actions">
        {many && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => addAll(many)}>
            {busy && <Spinner />} Add all {many.length}: {many.map((s) => s.name).join(", ")}
          </button>
        )}
        <button type="button" className="btn" onClick={read} disabled={!text.trim()}>Read config</button>
      </div>
    </div>
  );
}

export function AddServer() {
  const toast = useToast();
  const targets = useApi(api.targets, "Couldn't load targets");
  const [initial, setInitial] = useState(() => takePrefill() ?? { targets: "*" as const });
  // The form reads `initial` once; a new key remounts it with the pasted values
  const [formKey, setFormKey] = useState(0);
  if (!targets.data) return <Loading label="Loading…" />;

  return (
    <div className="page">
      <PageHeader title="Add server" subtitle="It goes into mcp-hub.json. Your editors get it on the next sync." />
      <PasteBox onOne={(s) => { setInitial(s); setFormKey((k) => k + 1); }} />
      <ServerForm
        key={formKey}
        targets={targets.data}
        initial={initial}
        submitLabel="Add server"
        onCancel={() => navigate("#/")}
        onSubmit={async (s) => {
          try {
            const created = await api.createServer(s);
            toast.success("Added", created.name);
            navigate(`#/server/${encodeURIComponent(created.id)}`);
          } catch (err) {
            toast.error("Couldn't add the server", (err as Error).message);
          }
        }}
      />
    </div>
  );
}
