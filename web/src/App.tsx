import { useRoute, type Route } from "./router.ts";
import { Dashboard } from "./pages/Dashboard.tsx";
import { ServerDetail } from "./pages/ServerDetail.tsx";
import { AddServer } from "./pages/AddServer.tsx";
import { Targets } from "./pages/Targets.tsx";
import { Diff } from "./pages/Diff.tsx";
import { Import } from "./pages/Import.tsx";
import { Discover } from "./pages/Discover.tsx";
import { MarkdownBrowser } from "./pages/MarkdownBrowser.tsx";
import { Empty } from "./components/ui.tsx";

const NAV: ({ view: Route["view"]; label: string; hash: string; also?: Route["view"][] } | null)[] = [
  { view: "dashboard", label: "Servers", hash: "#/", also: ["server", "add"] },
  { view: "diff", label: "Changes", hash: "#/diff" },
  { view: "targets", label: "Editors", hash: "#/targets" },
  null,
  { view: "skills", label: "Skills", hash: "#/skills" },
  { view: "memories", label: "Memories", hash: "#/memories" },
  null,
  { view: "import", label: "Import", hash: "#/import" },
  { view: "discover", label: "Find servers", hash: "#/discover" },
];

function Page({ route }: { route: Route }) {
  switch (route.view) {
    case "dashboard": return <Dashboard />;
    case "server": return <ServerDetail key={route.id} id={route.id} />;
    case "add": return <AddServer />;
    case "targets": return <Targets />;
    case "diff": return <Diff />;
    case "import": return <Import />;
    case "discover": return <Discover />;
    case "skills": return <MarkdownBrowser key="skills" kind="skills" />;
    case "memories": return <MarkdownBrowser key="memories" kind="memories" />;
    default:
      return <div className="page"><Empty title="There's no page here" action={<a className="btn btn-ghost" href="#/">Go to servers</a>} /></div>;
  }
}

export function App() {
  const route = useRoute();
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          MCP Hub
        </a>
        <nav className="nav">
          {NAV.map((n, i) =>
            n ? (
              <a key={n.view} href={n.hash}
                className={`nav-item${route.view === n.view || n.also?.includes(route.view) ? " active" : ""}`}
                aria-current={route.view === n.view ? "page" : undefined}>
                {n.label}
              </a>
            ) : <hr key={i} />,
          )}
        </nav>
      </aside>
      <main className="main">
        <Page route={route} />
      </main>
    </div>
  );
}
