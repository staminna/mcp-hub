import { api } from "../api.ts";
import { navigate } from "../router.ts";
import { useToast } from "../toast.tsx";
import { useApi } from "../useApi.ts";
import { ServerForm } from "../components/ServerForm.tsx";
import { Loading, PageHeader } from "../components/ui.tsx";
import { takePrefill } from "../prefill.ts";
import { useState } from "react";

export function AddServer() {
  const toast = useToast();
  const targets = useApi(api.targets, "Couldn't load targets");
  const [initial] = useState(() => takePrefill() ?? { targets: "*" as const });
  if (!targets.data) return <Loading label="Loading…" />;

  return (
    <div className="page">
      <PageHeader title="Add server" subtitle="It goes into mcp-hub.json. Your editors get it on the next sync." />
      <ServerForm
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
