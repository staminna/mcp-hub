import { useEffect, useState, type FormEvent } from "react";
import { api, type DiscoveryResult } from "../api.ts";
import { navigate } from "../router.ts";
import { setPrefill } from "../prefill.ts";
import { useToast } from "../toast.tsx";
import { Empty, Loading, PageHeader, Spinner } from "../components/ui.tsx";

type Tab = "registry" | "npm" | "running";

function addFrom(r: DiscoveryResult) {
  const short = r.name.split("/").pop()!.replace(/^(mcp-)?server-/, "").replace(/-mcp(-server)?$/, "");
  setPrefill({
    name: short,
    description: r.description,
    transport: "stdio",
    command: "npx",
    args: ["-y", r.name],
    targets: "*",
  });
  navigate("#/add");
}

export function Discover() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("registry");
  const [results, setResults] = useState<Partial<Record<Tab, DiscoveryResult[]>>>({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("mcp-server");

  const load = async (t: Tab) => {
    setLoading(true);
    try {
      const r = t === "registry" ? await api.discoverRegistry() : t === "running" ? await api.discoverRunning() : await api.discoverNpm(query.trim());
      setResults((x) => ({ ...x, [t]: r }));
    } catch (err) {
      toast.error("Search failed", (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== "npm" && !results[tab]) load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const search = (e: FormEvent) => { e.preventDefault(); if (query.trim()) load("npm"); };
  const list = results[tab];

  return (
    <div className="page page-wide">
      <PageHeader title="Find servers" subtitle="Pick one to open the Add form with it filled in. Nothing is added until you save." />
      <div className="tabs" role="tablist">
        {([["registry", "Popular"], ["npm", "Search npm"], ["running", "Running on this Mac"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "npm" && (
        <form className="row search" onSubmit={search}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search npm" />
          <button className="btn btn-primary" disabled={loading}>{loading && <Spinner />} Search</button>
        </form>
      )}
      {tab === "running" && (
        <div className="row search"><button className="btn btn-ghost" onClick={() => load("running")} disabled={loading}>Scan again</button></div>
      )}

      {loading ? <Loading label="Searching…" /> : !list ? (
        tab === "npm" ? <Empty title="Search npm for MCP servers">Try a service name, like “postgres” or “slack”.</Empty> : null
      ) : list.length === 0 ? (
        <Empty title={tab === "running" ? "No MCP processes running" : "Nothing found"} />
      ) : tab === "running" ? (
        <ul className="procs">
          {list.map((p, i) => <li key={i} className="mono wrap">{p.description?.replace(/^Running process: /, "")}</li>)}
        </ul>
      ) : (
        <div className="cards">
          {list.map((r) => (
            <article key={r.name} className="card">
              <h3 className="mono">{r.name}</h3>
              {r.description && <p>{r.description}</p>}
              <div className="row card-foot">
                <a href={`https://www.npmjs.com/package/${r.name}`} target="_blank" rel="noreferrer">npm page</a>
                <button className="btn btn-ghost btn-sm" onClick={() => addFrom(r)}>Use this</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
