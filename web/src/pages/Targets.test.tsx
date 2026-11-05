import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { Targets } from "./Targets.tsx";
import { installFakeApi } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

const row = (label: string) => screen.getByText(label, { selector: ".target-name" }).closest("li")!;

describe("Targets (Editors)", () => {
  it("lists editors and marks missing configs", async () => {
    installFakeApi();
    renderWithToasts(<Targets />);
    expect(await screen.findByText("~/.cursor/mcp.json (not found yet; sync will create it)")).toBeTruthy();
    expect(screen.getByText("~/.claude.json")).toBeTruthy();
  });

  it("syncs one editor after confirming and shows the result", async () => {
    const st = installFakeApi({ sync: { cursor: { added: ["fetch"] } } });
    const { user } = renderWithToasts(<Targets />);
    await screen.findByText("Cursor");
    await user.click(within(row("Cursor")).getByText("Sync"));
    await user.click(within(row("Cursor")).getByText("Write ~/.cursor/mcp.json"));
    expect(await screen.findByText("Synced cursor")).toBeTruthy();
    expect(within(row("Cursor")).getByText("1 added").className).toBe("ok-text");
    expect(st.calls.some((c) => c.path === "/api/targets/cursor/sync")).toBe(true);
  });

  it("shows a sync error returned in the result", async () => {
    installFakeApi({ sync: { cursor: { error: "refusing to sync" } } });
    const { user } = renderWithToasts(<Targets />);
    await screen.findByText("Cursor");
    await user.click(within(row("Cursor")).getByText("Sync"));
    await user.click(within(row("Cursor")).getByText("Write ~/.cursor/mcp.json"));
    expect(await screen.findByText("cursor not synced")).toBeTruthy();
    expect(within(row("Cursor")).getByText("refusing to sync").className).toBe("error-text");
  });

  it("reports a failed request", async () => {
    installFakeApi({ fail: { "POST /api/targets/cursor/sync": { status: 500, body: "down" } } });
    const { user } = renderWithToasts(<Targets />);
    await screen.findByText("Cursor");
    await user.click(within(row("Cursor")).getByText("Sync"));
    await user.click(within(row("Cursor")).getByText("Write ~/.cursor/mcp.json"));
    expect(await screen.findByText("Couldn't sync cursor")).toBeTruthy();
  });

  it("syncs all editors and counts the ones written", async () => {
    installFakeApi({ sync: { cursor: { error: "x" } } });
    const { user } = renderWithToasts(<Targets />);
    await screen.findByText("Cursor");
    await user.click(screen.getByText("Sync all"));
    await user.click(screen.getByText("Write all configs"));
    expect(await screen.findByText("1 of 2 written")).toBeTruthy();
    expect(within(row("Claude Code")).getByText("Already in sync")).toBeTruthy();
  });

  it("reports a failed sync all", async () => {
    installFakeApi({ fail: { "POST /api/sync/all": { status: 500, body: "nope" } } });
    const { user } = renderWithToasts(<Targets />);
    await screen.findByText("Cursor");
    await user.click(screen.getByText("Sync all"));
    await user.click(screen.getByText("Write all configs"));
    expect(await screen.findByText("Sync failed")).toBeTruthy();
  });
});
