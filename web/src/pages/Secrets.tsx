import { useState, type FormEvent } from "react";
import { api, type SecretVar } from "../api.ts";
import { useToast } from "../toast.tsx";
import { useApi } from "../useApi.ts";
import { ConfirmButton, Loading, PageHeader, Spinner, Tag } from "../components/ui.tsx";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const STATUS: Record<SecretVar["source"], { text: string; cls: string }> = {
  "env-file": { text: "Set", cls: "lamp-healthy" },
  environment: { text: "From your shell environment", cls: "lamp-unknown" },
  missing: { text: "Missing", cls: "lamp-unhealthy" },
};

/** One password field + Save; the value is cleared from the page once saved. */
function ValueForm({ name, onSaved, onCancel }: { name: string; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.setSecret(name, value);
      setValue("");
      toast.success("Saved to .env", `${name}. Run a sync to give it to your editors.`);
      onSaved();
    } catch (err) {
      toast.error(`Couldn't save ${name}`, (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="row secret-form" onSubmit={save}>
      <input type="password" autoComplete="off" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
        aria-label={`Value for ${name}`} placeholder="Paste the value" />
      <button className="btn btn-primary btn-sm" disabled={busy || !value.trim()}>{busy && <Spinner />} Save</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}

export function Secrets() {
  const toast = useToast();
  const vars = useApi(api.secrets, "Couldn't load secrets");
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  if (!vars.data) return <Loading label="Loading secrets…" />;

  const saved = () => { setEditing(null); setAdding(null); setNewName(""); vars.reload(); };
  const remove = async (name: string) => {
    try {
      await api.deleteSecret(name);
      toast.success("Removed from .env", name);
      vars.reload();
    } catch (err) {
      toast.error(`Couldn't remove ${name}`, (err as Error).message);
    }
  };
  const startAdd = (e: FormEvent) => {
    e.preventDefault();
    setAdding(newName.trim());
  };
  const nameOk = NAME.test(newName.trim());
  const missing = vars.data.filter((v) => v.source === "missing").length;

  return (
    <div className="page">
      <PageHeader
        title="Secrets"
        subtitle={<>Tokens and keys your servers use as <code>{"${NAME}"}</code>, stored in the hub's <code>.env</code>. Values are write-only: once saved they're never shown or sent to this page again.</>}
      />
      {missing > 0 && (
        <p className="error-text">{missing} {missing === 1 ? "variable is" : "variables are"} missing. Servers that use them are skipped at sync until you set them.</p>
      )}

      <ul className="targets">
        {vars.data.map((v) => (
          <li key={v.name} className="target secret">
            <div className="target-main">
              <div className="row">
                <span className="mono target-name">{v.name}</span>
                <span className={`lamp ${STATUS[v.source].cls}`}><span className="lamp-dot" /><span className="lamp-text">{STATUS[v.source].text}</span></span>
              </div>
              <div className="row muted">
                {v.usedBy.length ? <>Used by {v.usedBy.map((id) => <a key={id} href={`#/server/${encodeURIComponent(id)}`}><Tag>{id}</Tag></a>)}</> : "Not used by any server"}
              </div>
              {editing === v.name && <ValueForm name={v.name} onSaved={saved} onCancel={() => setEditing(null)} />}
            </div>
            {editing !== v.name && (
              <div className="row">
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(v.name)}>{v.source === "env-file" ? "Replace" : "Set"}</button>
                {v.source === "env-file" && (
                  <ConfirmButton className="btn btn-danger btn-sm" confirmLabel={`Remove ${v.name}`} onConfirm={() => remove(v.name)}>Remove</ConfirmButton>
                )}
              </div>
            )}
          </li>
        ))}
        {vars.data.length === 0 && <li className="target muted">No servers use a <code>{"${VAR}"}</code> yet and .env is empty.</li>}
      </ul>

      <h2 className="panel-title">Add a variable</h2>
      {adding ? (
        <div className="panel">
          <div className="mono target-name">{adding}</div>
          <ValueForm name={adding} onSaved={saved} onCancel={() => setAdding(null)} />
        </div>
      ) : (
        <form className="row secret-form" onSubmit={startAdd}>
          <input className="mono" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="GITHUB_TOKEN" aria-label="Variable name" />
          <button className="btn btn-ghost" disabled={!nameOk}>Next</button>
          {newName.trim() && !nameOk && <span className="error-text">Letters, digits and _ only, not starting with a digit.</span>}
        </form>
      )}
      <p className="muted">Then use it in a server's environment as <code>{"${NAME}"}</code>.</p>
    </div>
  );
}
