import { Fragment, useState } from "react";
import { api, type ContentEntry, type ContentKind, type MarkdownFile, type MemoryEntry, type SkillEntry } from "../api.ts";
import { useToast } from "../toast.tsx";
import { useApi } from "../useApi.ts";
import { Markdown } from "../components/Markdown.tsx";
import { Empty, Loading, PageHeader, Spinner, Tag } from "../components/ui.tsx";

const KINDS = {
  skills: {
    title: "Skills",
    subtitle: "SKILL.md files in ~/.claude/skills and ~/.gemini/skills. Edits save straight to the file.",
    one: "skill",
    group: (e: ContentEntry) => (e as SkillEntry).source,
    label: (e: ContentEntry) => (e as SkillEntry).id,
  },
  memories: {
    title: "Memories",
    subtitle: "Memory files in ~/.claude/projects/*/memory. Edits save straight to the file.",
    one: "memory",
    group: (e: ContentEntry) => (e as MemoryEntry).project,
    label: (e: ContentEntry) => (e as MemoryEntry).file,
  },
} as const;

export function MarkdownBrowser({ kind }: { kind: ContentKind }) {
  const cfg = KINDS[kind];
  const toast = useToast();
  const entries = useApi<ContentEntry[]>(() => api.listContent(kind), `Couldn't load ${kind}`, [kind]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ContentEntry | null>(null);
  const [doc, setDoc] = useState<MarkdownFile | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = not editing
  const [saving, setSaving] = useState(false);

  const dirty = draft !== null && draft !== doc?.content;

  const open = async (e: ContentEntry) => {
    if (dirty) return toast.error("You have unsaved changes", "Save or cancel the edit first.");
    setSelected(e);
    setDoc(null);
    setDraft(null);
    try {
      setDoc(await api.readContent(kind, e.path));
    } catch (err) {
      toast.error("Couldn't open the file", (err as Error).message);
    }
  };

  // Save is only enabled while editing an open file (dirty), so both are set
  const save = async (selected: ContentEntry, draft: string) => {
    setSaving(true);
    try {
      await api.saveContent(kind, selected.path, draft);
      setDoc(await api.readContent(kind, selected.path));
      setDraft(null);
      toast.success("Saved", selected.path);
      entries.reload();
    } catch (err) {
      toast.error("Couldn't save", (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!entries.data) return <Loading label={`Loading ${kind}…`} />;

  const q = filter.trim().toLowerCase();
  const visible = entries.data.filter((e) =>
    !q || [cfg.label(e), e.name, e.description, cfg.group(e)].join(" ").toLowerCase().includes(q));
  const groups: { name: string; items: ContentEntry[] }[] = [];
  for (const e of visible) {
    const g = cfg.group(e);
    if (groups.at(-1)?.name !== g) groups.push({ name: g, items: [] });
    groups.at(-1)!.items.push(e);
  }

  const fm = doc ? Object.entries(doc.frontmatter) : [];

  return (
    <div className="page page-wide">
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} />
      <div className="md-layout">
        <aside className="md-index">
          <input type="search" placeholder={`Filter ${entries.data.length} ${kind}`} value={filter}
            onChange={(e) => setFilter(e.target.value)} aria-label={`Filter ${kind}`} />
          <nav className="md-list">
            {groups.length === 0 && <p className="muted pad">Nothing matches.</p>}
            {groups.map((g) => (
              <Fragment key={g.name}>
                <div className="md-group">{g.name}</div>
                {g.items.map((e) => (
                  <button key={e.path} className={`md-item${selected?.path === e.path ? " active" : ""}`} onClick={() => open(e)}>
                    <span className="md-item-name">
                      {cfg.label(e)}
                      {"isIndex" in e && e.isIndex && <Tag>index</Tag>}
                      {"type" in e && e.type && <Tag>{e.type}</Tag>}
                    </span>
                    {e.description && <span className="md-item-desc">{e.description}</span>}
                  </button>
                ))}
              </Fragment>
            ))}
          </nav>
        </aside>

        <section className="md-doc">
          {!selected ? (
            <Empty title={`Pick a ${cfg.one}`}>Choose a file on the left to read or edit it.</Empty>
          ) : (
            <>
              <div className="md-doc-head">
                <div className="min0">
                  <h2>{selected.name}</h2>
                  <div className="mono muted wrap">{selected.path}</div>
                </div>
                <div className="row">
                  {draft !== null ? (
                    <>
                      <button className="btn btn-ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
                      <button className="btn btn-primary" onClick={() => save(selected!, draft!)} disabled={saving || !dirty}>{saving && <Spinner />} Save</button>
                    </>
                  ) : (
                    <button className="btn btn-ghost" disabled={!doc} onClick={() => doc && setDraft(doc.content)}>Edit</button>
                  )}
                </div>
              </div>
              {!doc ? <Loading label="Opening…" /> : draft !== null ? (
                <textarea className="md-editor mono" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="File contents" />
              ) : (
                <>
                  {fm.length > 0 && (
                    <dl className="props frontmatter">
                      {fm.map(([k, v]) => (
                        <Fragment key={k}><dt>{k}</dt><dd>{typeof v === "string" ? v : JSON.stringify(v)}</dd></Fragment>
                      ))}
                    </dl>
                  )}
                  <Markdown source={doc.body} />
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
