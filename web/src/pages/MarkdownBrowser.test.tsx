import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { MarkdownBrowser } from "./MarkdownBrowser.tsx";
import { installFakeApi } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

describe("MarkdownBrowser", () => {
  it("lists skills by source, opens one and renders it safely", async () => {
    installFakeApi();
    const { user, container } = renderWithToasts(<MarkdownBrowser kind="skills" />);
    expect(await screen.findByText("Pick a skill")).toBeTruthy();
    expect(screen.getByText("claude")).toBeTruthy();
    expect(screen.getByText("gemini")).toBeTruthy();
    await user.click(screen.getByText("alpha"));
    expect(await screen.findByText("Alpha heading")).toBeTruthy();
    expect(container.querySelector(".markdown script")).toBeNull();
    expect(screen.getByText('{"a":1}')).toBeTruthy(); // non-string frontmatter
    expect(screen.getByText("/s/alpha/SKILL.md")).toBeTruthy();
    // a file with no frontmatter shows no frontmatter box
    await user.click(screen.getByText("beta"));
    expect(await screen.findByText("Plain beta")).toBeTruthy();
    expect(container.querySelector(".frontmatter")).toBeNull();
  });

  it("filters, including the nothing-matches state", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<MarkdownBrowser kind="skills" />);
    const box = await screen.findByLabelText("Filter skills");
    await user.type(box, "first");
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.queryByText("beta")).toBeNull();
    await user.clear(box);
    await user.type(box, "zzz");
    expect(screen.getByText("Nothing matches.")).toBeTruthy();
  });

  it("lists memories with index and type tags, edits and saves", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<MarkdownBrowser kind="memories" />);
    expect(await screen.findByText("Pick a memory")).toBeTruthy();
    expect(screen.getByText("index")).toBeTruthy();
    expect(screen.getByText("project")).toBeTruthy();
    await user.click(screen.getByText("note.md"));
    await screen.findByText("Note body");
    await user.click(screen.getByText("Edit"));
    const editor = screen.getByLabelText("File contents") as HTMLTextAreaElement;
    expect((screen.getByText("Save", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(editor, "!");
    await user.click(screen.getByText("Save", { selector: "button" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(st.files["/m/note.md"].endsWith("Note body!")).toBe(true);
    expect(screen.getByText("Note body!")).toBeTruthy();
  });

  it("guards unsaved changes and cancel discards them", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<MarkdownBrowser kind="memories" />);
    await user.click(await screen.findByText("note.md"));
    await user.click(await screen.findByText("Edit"));
    await user.type(screen.getByLabelText("File contents"), "x");
    await user.click(screen.getByText("MEMORY.md"));
    expect(await screen.findByText("You have unsaved changes")).toBeTruthy();
    expect(screen.getByLabelText("File contents")).toBeTruthy();
    await user.click(screen.getByText("Cancel"));
    await user.click(screen.getByText("MEMORY.md"));
    expect(await screen.findByText("note", { selector: "a" })).toBeTruthy();
  });

  it("opening a file while editing without changes is allowed", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<MarkdownBrowser kind="memories" />);
    await user.click(await screen.findByText("note.md"));
    await user.click(await screen.findByText("Edit"));
    await user.click(screen.getByText("MEMORY.md"));
    expect(await screen.findByText("note", { selector: "a" })).toBeTruthy();
  });

  it("reports open and save failures", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<MarkdownBrowser kind="memories" />);
    st.files["/m/note.md"] = undefined as unknown as string;
    delete st.files["/m/note.md"];
    await user.click(await screen.findByText("note.md"));
    expect(await screen.findByText("Couldn't open the file")).toBeTruthy();
    expect(screen.getByText("Opening…")).toBeTruthy();
    expect((screen.getByText("Edit") as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByText("MEMORY.md"));
    await user.click(await screen.findByText("Edit"));
    await user.type(screen.getByLabelText("File contents"), "y");
    st.fail["PUT /api/memories/file"] = { status: 400, body: '{"error":"only .md files are allowed"}' };
    await user.click(screen.getByText("Save", { selector: "button" }));
    expect(await screen.findByText("only .md files are allowed")).toBeTruthy();
    expect(within(document.body).getByLabelText("File contents")).toBeTruthy();
  });

  it("shows a loading state until the list arrives", async () => {
    installFakeApi({ fail: { "GET /api/skills": { status: 500 } } });
    renderWithToasts(<MarkdownBrowser kind="skills" />);
    expect(screen.getByText("Loading skills…")).toBeTruthy();
    expect(await screen.findByText("Couldn't load skills")).toBeTruthy();
  });
});
