import { api, type TargetDiff } from "../api.ts";
import { useApi } from "../useApi.ts";
import { Empty, Loading, PageHeader } from "../components/ui.tsx";

const LABEL = { add: "Will be added", update: "Will be updated" };

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
        const changed = t.servers;
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
