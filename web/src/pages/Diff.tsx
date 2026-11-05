import { api, type TargetDiff } from "../api.ts";
import { useApi } from "../useApi.ts";
import { Empty, Loading, PageHeader } from "../components/ui.tsx";

type Row = { id: string; action: "add" | "update" | "unchanged" | "unmanaged"; fields: string[] };

/** Compare before/after per server. Only field names are shown, never values (they may hold tokens). */
function rows(t: TargetDiff): Row[] {
  const parse = (s: string): Record<string, Record<string, unknown>> => {
    try { return JSON.parse(s).mcpServers ?? {}; } catch { return {}; }
  };
  const before = parse(t.before);
  const after = parse(t.after);
  return Object.keys(after).sort().map((id) => {
    const b = before[id];
    const a = after[id];
    if (!b) return { id, action: "add", fields: [] };
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const fields = [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (fields.length) return { id, action: "update", fields };
    return { id, action: JSON.stringify(a) === JSON.stringify(b) ? "unchanged" : "update", fields };
  });
}

const LABEL = { add: "Will be added", update: "Will be updated", unchanged: "In sync", unmanaged: "Not in hub, kept" };

export function Diff() {
  const diff = useApi(api.diff, "Couldn't compute the changes");
  if (!diff.data) return diff.error ? <Empty title="Couldn't compute the changes">{diff.error}</Empty> : <Loading label="Comparing hub with your editors…" />;

  const targets = diff.data.targets;
  const pending = targets.filter((t) => t.hasChanges);

  return (
    <div className="page">
      <PageHeader
        title="Changes"
        subtitle={pending.length
          ? `A sync would change ${pending.length} of ${targets.length} editor configs. Values are hidden; only the changed fields are named.`
          : "Every editor config matches the hub."}
        actions={<a className="btn btn-primary" href="#/targets">Go to sync</a>}
      />
      {targets.map((t) => {
        const all = rows(t);
        const changed = all.filter((r) => r.action === "add" || r.action === "update");
        return (
          <section key={t.name} className="diff-target">
            <h2>
              {t.label}
              {t.error ? (
                <span className="badge badge-err">Can't read</span>
              ) : (
                <span className={t.hasChanges ? "badge badge-warn" : "badge badge-ok"}>
                  {t.hasChanges ? `${changed.length} change${changed.length === 1 ? "" : "s"}` : "In sync"}
                </span>
              )}
            </h2>
            {t.error && <p className="error-text">{t.error}. Sync leaves this file alone until it's fixed.</p>}
            {changed.length > 0 && (
              <ul className="diff-rows">
                {changed.map((r) => (
                  <li key={r.id} className={`diff-row diff-${r.action}`}>
                    <span className="diff-sign" aria-hidden="true">{r.action === "add" ? "+" : "~"}</span>
                    <span className="mono">{r.id}</span>
                    <span className="muted">{LABEL[r.action]}{r.fields.length > 0 && `: ${r.fields.join(", ")}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
