import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Diff } from "./Diff.tsx";
import { installFakeApi } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

describe("Diff (Changes)", () => {
  it("names added and updated servers with field names only", async () => {
    installFakeApi();
    renderWithToasts(<Diff />);
    expect(await screen.findByText(/A sync would change 1 of 2 editor configs/)).toBeTruthy();
    expect(screen.getByText("2 changes")).toBeTruthy();
    expect(screen.getByText("In sync")).toBeTruthy();
    expect(screen.getByText("Will be updated: command, args")).toBeTruthy();
    expect(screen.getByText("Will be added")).toBeTruthy();
    expect(screen.queryByText("same")).toBeNull(); // unchanged rows hidden
    expect(screen.queryByText(/uvx/)).toBeNull(); // values never shown
  });

  it("counts one change in the singular, and tolerates bad JSON", async () => {
    installFakeApi({
      diff: [
        { name: "cursor", label: "Cursor", hasChanges: true, before: "not json", after: JSON.stringify({ mcpServers: { a: {} } }) },
        { name: "vscode", label: "VS Code", hasChanges: true, before: "{}", after: "{}" },
        // same keys, same values, different key order: counted as an update with no fields
        { name: "gemini", label: "Gemini", hasChanges: true, before: JSON.stringify({ mcpServers: { o: { a: 1, b: 2 } } }), after: JSON.stringify({ mcpServers: { o: { b: 2, a: 1 } } }) },
      ],
    });
    renderWithToasts(<Diff />);
    expect(await screen.findAllByText("1 change")).toHaveLength(2);
    expect(screen.getAllByText("0 changes")).toHaveLength(1);
    expect(screen.getByText("Will be updated")).toBeTruthy();
  });

  it("flags an editor whose config can't be read", async () => {
    installFakeApi({ diff: [{ name: "docker", label: "Docker MCP", hasChanges: false, before: "", after: "", error: "config.yaml has no server list" }] });
    renderWithToasts(<Diff />);
    expect(await screen.findByText("Can't read")).toBeTruthy();
    expect(screen.getByText(/config.yaml has no server list\. Sync leaves this file alone/)).toBeTruthy();
  });

  it("says everything matches when nothing would change", async () => {
    installFakeApi({ diff: [{ name: "cursor", label: "Cursor", hasChanges: false, before: "{}", after: "{}" }] });
    renderWithToasts(<Diff />);
    expect(await screen.findByText("Every editor config matches the hub.")).toBeTruthy();
  });

  it("shows the error when the diff fails", async () => {
    installFakeApi({ fail: { "GET /api/sync/diff": { status: 500, body: "cannot read" } } });
    renderWithToasts(<Diff />);
    expect(await screen.findByText("cannot read", { selector: "p" })).toBeTruthy();
  });
});
