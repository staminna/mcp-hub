import { useMemo, useState } from "react";
import { api, launchLine, serverTargets, type McpServer, type TargetInfo } from "../api.ts";
import { navigate } from "../router.ts";
import { useToast } from "../toast.tsx";
import { useApi } from "../useApi.ts";
import { Empty, Lamp, Loading, PageHeader, Spinner, type Health } from "../components/ui.tsx";

export function Dashboard() {
  const toast = useToast();
  const servers = useApi(api.servers, "Couldn't load servers");
  const targets = useApi(api.targets, "Couldn't load targets");
  const [health, setHealth] = useState<Record<string, { status: Health; error?: string }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);

  const list = servers.data;
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!list) return [];
    return list.filter((s) =>
      !q || [s.id, s.name, s.description, launchLine(s), ...s.tags].join(" ").toLowerCase().includes(q));
  }, [list, filter]);

  if (!list || !targets.data) {
    return servers.error || targets.error
      ? <Empty title="The hub isn't answering">Start it with <code>npm run dev -- serve</code>, then reload this page.</Empty>
      : <Loading label="Loading servers…" />;
  }

  // Editors that are switched off aren't synced, so they get no column
  const cols: TargetInfo[] = targets.data.filter((t) => t.enabled);
  const allNames = cols.map((t) => t.name);
  const enabled = list.filter((s) => !s.disabled).length;

  const toggle = async (s: McpServer) => {
    setBusy((b) => ({ ...b, [s.id]: true }));
    try {
      const updated = await api.toggleServer(s.id);
      servers.setData((l) => l && l.map((x) => (x.id === s.id ? updated : x)));
      toast.success(updated.disabled ? "Disabled" : "Enabled", `${s.name}. Run a sync to apply it to your editors.`);
    } catch (err) {
      toast.error("Couldn't change the server", (err as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [s.id]: false }));
    }
  };

  const check = async (s: McpServer) => {
    setHealth((h) => ({ ...h, [s.id]: { status: "checking" } }));
    try {
      const r = await api.checkHealth(s.id);
      setHealth((h) => ({ ...h, [s.id]: { status: r.status, error: r.error } }));
    } catch (err) {
      setHealth((h) => ({ ...h, [s.id]: { status: "unknown", error: (err as Error).message } }));
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    await Promise.all(visible.filter((s) => !s.disabled).map(check));
    setCheckingAll(false);
  };

  return (
    <div className="page page-wide">
      <PageHeader
        title="Servers"
        subtitle={`${list.length} in the hub, ${enabled} enabled. Filled dot: synced to that editor. Ring: the editor has it, but the hub doesn\'t sync it there.`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={checkAll} disabled={checkingAll}>
              {checkingAll && <Spinner />} Check health
            </button>
            <button className="btn btn-primary" onClick={() => navigate("#/add")}>Add server</button>
          </>
        }
      />

      {list.length === 0 ? (
        <Empty
          title="No servers in the hub yet"
          action={<div className="row"><button className="btn btn-primary" onClick={() => navigate("#/import")}>Import from an editor</button><button className="btn btn-ghost" onClick={() => navigate("#/add")}>Add one by hand</button></div>}
        >
          Import the servers you already have, or add one by hand.
        </Empty>
      ) : (
        <>
          <input className="filter" type="search" placeholder="Filter by name, command or tag" value={filter}
            onChange={(e) => setFilter(e.target.value)} aria-label="Filter servers" />
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="col-server">Server</th>
                  {cols.map((t) => (
                    <th key={t.name} className="col-target" title={`${t.label} — ${t.path}${t.exists ? "" : " (not found)"}`}>
                      <span className={t.exists ? "" : "muted"}>{t.label}</span>
                    </th>
                  ))}
                  <th className="col-health">Health</th>
                  <th className="col-on">On</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const to = new Set(serverTargets(s, allNames));
                  const h = health[s.id];
                  return (
                    <tr key={s.id} className={s.disabled ? "off" : ""}>
                      <td className="col-server">
                        <a href={`#/server/${encodeURIComponent(s.id)}`} className="server-name">{s.name}</a>
                        <div className="server-launch mono" title={launchLine(s)}>{launchLine(s)}</div>
                      </td>
                      {cols.map((t) => {
                        const synced = to.has(t.name);
                        const there = t.present.includes(s.id);
                        const [cls, title] = synced
                          ? [" on", `Synced to ${t.label}`]
                          : there
                            ? [" stray", `In ${t.label}, but the hub doesn't sync it there (edit the server's editors, or re-run import)`]
                            : ["", `Not in ${t.label}`];
                        return (
                          <td key={t.name} className="col-target">
                            <span className={`jack${cls}`} title={title} />
                          </td>
                        );
                      })}
                      <td className="col-health">
                        <button className="lamp-btn" onClick={() => check(s)} disabled={s.disabled || h?.status === "checking"}
                          title={h?.error ?? "Start the server and check it answers"}>
                          <Lamp status={h?.status ?? "unknown"} title={h?.error} />
                        </button>
                      </td>
                      <td className="col-on">
                        <button role="switch" aria-checked={!s.disabled} aria-label={`${s.disabled ? "Enable" : "Disable"} ${s.name}`}
                          className="switch" onClick={() => toggle(s)} disabled={busy[s.id]}>
                          <span />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && <p className="muted pad">No server matches “{filter}”.</p>}
          </div>
        </>
      )}
    </div>
  );
}
