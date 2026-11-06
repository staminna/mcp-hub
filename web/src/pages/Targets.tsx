import { useState } from "react";
import { api, type SyncResult, type TargetName } from "../api.ts";
import { useToast } from "../toast.tsx";
import { useApi } from "../useApi.ts";
import { ConfirmButton, Loading, PageHeader, Spinner, syncSummary } from "../components/ui.tsx";

export function Targets() {
  const toast = useToast();
  const targets = useApi(api.targets, "Couldn't load editors");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SyncResult>>({});

  if (!targets.data) return <Loading label="Loading editors…" />;

  const record = (r: SyncResult) => {
    setResults((x) => ({ ...x, [r.target]: r }));
    if (r.error) toast.error(`${r.target} not synced`, r.error);
  };

  const sync = async (name: TargetName) => {
    setBusy((b) => ({ ...b, [name]: true }));
    try {
      const r = await api.syncTarget(name);
      record(r);
      if (!r.error) toast.success(`Synced ${name}`, syncSummary(r));
      targets.reload();
    } catch (err) {
      toast.error(`Couldn't sync ${name}`, (err as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [name]: false }));
    }
  };

  const setEnabled = async (name: TargetName, enabled: boolean) => {
    setBusy((b) => ({ ...b, [name]: true }));
    try {
      await api.setTargetEnabled(name, enabled);
      targets.reload();
    } catch (err) {
      toast.error(`Couldn't turn ${name} ${enabled ? "on" : "off"}`, (err as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [name]: false }));
    }
  };

  const syncAll = async () => {
    setBusy((b) => ({ ...b, all: true }));
    try {
      const rs = await api.syncAll();
      rs.forEach(record);
      toast.success("Synced every editor", `${rs.filter((r) => !r.error).length} of ${rs.length} written`);
      targets.reload();
    } catch (err) {
      toast.error("Sync failed", (err as Error).message);
    } finally {
      setBusy((b) => ({ ...b, all: false }));
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Editors"
        subtitle="The config files sync writes to. Turn off editors you don't use and sync will leave them alone. Sync only adds and updates hub servers; anything else in the file is kept, and a backup is made first."
        actions={
          <>
            <a className="btn btn-ghost" href="#/diff">Review changes</a>
            <ConfirmButton className="btn btn-primary" confirmLabel="Write all configs" onConfirm={syncAll} disabled={busy.all}>
              {busy.all && <Spinner />} Sync all
            </ConfirmButton>
          </>
        }
      />
      <ul className="targets">
        {targets.data.map((t) => {
          const r = results[t.name];
          return (
            <li key={t.name} className={t.enabled ? "target" : "target off"}>
              <span className="target-icon" aria-hidden="true">{t.icon}</span>
              <div className="target-main">
                <div className="target-name">{t.label}</div>
                <div className="mono muted">{t.path}{!t.exists && " (not found yet; sync will create it)"}</div>
                {!t.enabled && <div className="muted">Off: skipped by Sync all and auto-sync</div>}
                {r && <div className={r.error ? "error-text" : "ok-text"}>{syncSummary(r)}</div>}
              </div>
              <button role="switch" aria-checked={t.enabled} aria-label={`Sync to ${t.label}`}
                className="switch" onClick={() => setEnabled(t.name, !t.enabled)} disabled={busy[t.name]}>
                <span />
              </button>
              <ConfirmButton className="btn btn-ghost" confirmLabel={`Write ${t.path}`} onConfirm={() => sync(t.name)} disabled={busy[t.name] || !t.enabled}>
                {busy[t.name] && <Spinner />} Sync
              </ConfirmButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
