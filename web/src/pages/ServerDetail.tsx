import { useState } from "react";
import { api, launchLine, serverTargets, type HealthResult, type McpServer } from "../api.ts";
import { navigate } from "../router.ts";
import { useToast } from "../toast.tsx";
import { useApi } from "../useApi.ts";
import { ServerForm } from "../components/ServerForm.tsx";
import { ConfirmButton, Empty, Lamp, Loading, PageHeader, Spinner, Tag } from "../components/ui.tsx";

export function ServerDetail({ id }: { id: string }) {
  const toast = useToast();
  const server = useApi(() => api.server(id), "Couldn't load the server", [id]);
  const targets = useApi(api.targets, "Couldn't load targets");
  const [editing, setEditing] = useState(false);
  const [health, setHealth] = useState<HealthResult | "checking" | null>(null);

  if (server.error) {
    return <Empty title={`No server called “${id}”`} action={<a className="btn btn-ghost" href="#/">Back to servers</a>} />;
  }
  const s = server.data;
  if (!s || !targets.data) return <Loading label="Loading server…" />;

  const save = async (form: Partial<McpServer> & { name: string }) => {
    try {
      // Keep fields the form doesn't edit
      const updated = await api.updateServer(id, { disabled: s.disabled, disabledTools: s.disabledTools, ...form });
      server.setData(updated);
      setEditing(false);
      toast.success("Saved", `${updated.name}. Run a sync to apply it to your editors.`);
    } catch (err) {
      toast.error("Couldn't save", (err as Error).message);
    }
  };

  const remove = async () => {
    try {
      await api.deleteServer(id);
      toast.success("Removed from the hub", `${s.name}. Editor configs keep their copy until you remove it there.`);
      navigate("#/");
    } catch (err) {
      toast.error("Couldn't remove", (err as Error).message);
    }
  };

  const check = async () => {
    setHealth("checking");
    try {
      setHealth(await api.checkHealth(id));
    } catch (err) {
      setHealth({ serverId: id, status: "unknown", error: (err as Error).message, checkedAt: "" });
    }
  };

  if (editing) {
    return (
      <div className="page">
        <PageHeader title={`Edit ${s.name}`} />
        <ServerForm initial={s} targets={targets.data} submitLabel="Save changes" onSubmit={save} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  const allNames = targets.data.map((t) => t.name);
  const to = serverTargets(s, allNames);
  const env = Object.entries(s.env ?? {});
  const json = JSON.stringify(s, null, 2);

  return (
    <div className="page page-wide">
      <PageHeader
        title={s.name}
        subtitle={s.description || (s.disabled ? "Disabled: sync leaves it as it is in your editors." : undefined)}
        actions={
          <>
            <ConfirmButton onConfirm={remove} confirmLabel="Remove from hub" className="btn btn-danger">Remove</ConfirmButton>
            <button className="btn btn-primary" onClick={() => setEditing(true)}>Edit</button>
          </>
        }
      />

      <div className="detail-grid">
        <section className="panel">
          <dl className="props">
            <dt>ID</dt><dd className="mono">{s.id}</dd>
            <dt>Transport</dt><dd>{s.transport}</dd>
            <dt>{s.transport === "stdio" ? "Runs" : "URL"}</dt><dd className="mono wrap">{launchLine(s)}</dd>
            {s.cwd && (<><dt>Working dir</dt><dd className="mono wrap">{s.cwd}</dd></>)}
            <dt>Status</dt><dd>{s.disabled ? "Disabled" : "Enabled"}</dd>
            <dt>Health</dt>
            <dd className="row">
              {health === "checking" ? <Lamp status="checking" /> : <Lamp status={health?.status ?? "unknown"} />}
              <button className="btn btn-ghost btn-sm" onClick={check} disabled={health === "checking"}>
                {health === "checking" && <Spinner />} Check now
              </button>
            </dd>
            {health && health !== "checking" && health.error && (<><dt /><dd className="error-text mono wrap">{health.error}</dd></>)}
            <dt>Tags</dt><dd className="row">{s.tags.length ? s.tags.map((t) => <Tag key={t}>{t}</Tag>) : <span className="muted">None</span>}</dd>
            <dt>Syncs to</dt>
            <dd className="row">
              {s.targets === "*" && <span className="muted">Every editor:</span>}
              {to.map((t) => <Tag key={t}>{targets.data!.find((x) => x.name === t)?.label ?? t}</Tag>)}
              {to.length === 0 && <span className="muted">No editors</span>}
            </dd>
          </dl>

          <h2 className="panel-title">Environment</h2>
          {env.length === 0 ? (
            <p className="muted">No environment variables.</p>
          ) : (
            <dl className="env">
              {env.map(([k, v]) => (
                <div key={k} className="env-row">
                  <dt className="mono">{k}</dt>
                  <dd className="mono wrap">
                    {v}
                    {v.includes("${") && <span className="muted"> (filled in from .env at sync)</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">In mcp-hub.json</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(json); toast.info("Copied"); }}>Copy</button>
          </div>
          <pre className="code">{json}</pre>
        </section>
      </div>
    </div>
  );
}
