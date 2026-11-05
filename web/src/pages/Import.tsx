import { useState } from "react";
import { api, type TargetName } from "../api.ts";
import { useToast } from "../toast.tsx";
import { useApi } from "../useApi.ts";
import { Loading, PageHeader, Spinner } from "../components/ui.tsx";

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

export function Import() {
  const toast = useToast();
  const targets = useApi(api.targets, "Couldn't load editors");
  const [from, setFrom] = useState<TargetName | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[] | null>(null);

  if (!targets.data) return <Loading label="Loading editors…" />;

  const run = async () => {
    if (!from) return;
    setBusy(true);
    setLog(null);
    try {
      const r = await api.importFrom(from);
      setLog(r.logs.map(stripAnsi));
      toast.success("Import finished", `from ${from}`);
    } catch (err) {
      toast.error("Import failed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Import from an editor"
        subtitle="Copies servers the hub doesn't have yet into mcp-hub.json. Tokens it finds go into .env. The editor's file isn't changed."
      />
      <div className="choices" role="radiogroup">
        {targets.data.map((t) => (
          <label key={t.name} className={`choice${from === t.name ? " selected" : ""}${t.exists ? "" : " muted"}`}>
            <input type="radio" name="from" value={t.name} checked={from === t.name} disabled={!t.exists}
              onChange={() => setFrom(t.name)} />
            <span className="target-icon" aria-hidden="true">{t.icon}</span>
            <span>
              <span className="target-name">{t.label}</span>
              <span className="mono muted block">{t.exists ? t.path : `${t.path} not found`}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={run} disabled={!from || busy}>
          {busy && <Spinner />} {from ? `Import from ${targets.data.find((t) => t.name === from)?.label}` : "Choose an editor"}
        </button>
      </div>
      {log && (
        <>
          <pre className="code">{log.join("\n") || "Nothing new to import."}</pre>
          <p><a href="#/">See your servers</a></p>
        </>
      )}
    </div>
  );
}
