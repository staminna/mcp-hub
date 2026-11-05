import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { Dashboard } from "./Dashboard.tsx";
import { installFakeApi, server } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

describe("Dashboard", () => {
  it("shows the server × editor matrix", async () => {
    installFakeApi();
    renderWithToasts(<Dashboard />);
    await screen.findByText("fetch");
    expect(screen.getByText("3 in the hub, 2 enabled. Each dot is an editor the server is synced to.")).toBeTruthy();
    const row = screen.getByText("fetch").closest("tr")!;
    expect(within(row).getByTitle("Synced to Claude Code")).toBeTruthy();
    expect(within(row).getByTitle("Synced to Cursor")).toBeTruthy();
    expect(screen.getByText("https://example.com/mcp")).toBeTruthy();
    expect(screen.getByText("off").closest("tr")!.className).toBe("off");
    // the missing editor's header is dimmed and says so
    expect(screen.getByTitle("Cursor — ~/.cursor/mcp.json (not found)")).toBeTruthy();
    expect(screen.getByTitle("Claude Code — ~/.claude.json")).toBeTruthy();
  });

  it("filters by name, command or tag", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<Dashboard />);
    await screen.findByText("fetch");
    await user.type(screen.getByLabelText("Filter servers"), "WEB");
    expect(screen.queryByText("remote")).toBeNull();
    expect(screen.getByText("fetch")).toBeTruthy();
    await user.clear(screen.getByLabelText("Filter servers"));
    await user.type(screen.getByLabelText("Filter servers"), "zzz");
    expect(screen.getByText("No server matches “zzz”.")).toBeTruthy();
  });

  it("toggles a server on and off", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<Dashboard />);
    await screen.findByText("fetch");
    await user.click(screen.getByLabelText("Disable fetch"));
    expect(await screen.findByText("Disabled")).toBeTruthy();
    expect(screen.getByLabelText("Enable fetch").getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByLabelText("Enable off"));
    expect(await screen.findByText("Enabled")).toBeTruthy();
  });

  it("reports a failed toggle", async () => {
    installFakeApi({ fail: { "POST /api/servers/fetch/toggle": { status: 500, body: '{"error":"disk full"}' } } });
    const { user } = renderWithToasts(<Dashboard />);
    await screen.findByText("fetch");
    await user.click(screen.getByLabelText("Disable fetch"));
    expect(await screen.findByText("disk full")).toBeTruthy();
    expect((screen.getByLabelText("Disable fetch") as HTMLButtonElement).disabled).toBe(false);
  });

  it("checks one server and all enabled servers", async () => {
    installFakeApi({
      health: { remote: { serverId: "remote", status: "unhealthy", error: "HTTP 500", checkedAt: "" } },
      fail: { "POST /api/servers/fetch/health": { status: 500, body: "spawn failed" } },
    });
    const { user } = renderWithToasts(<Dashboard />);
    await screen.findByText("fetch");
    const remoteRow = screen.getByText("remote").closest("tr")!;
    await user.click(within(remoteRow).getByTitle("Start the server and check it answers"));
    expect(await within(remoteRow).findByText("Unhealthy")).toBeTruthy();
    expect(within(remoteRow).getAllByTitle("HTTP 500").length).toBeGreaterThan(0);

    await user.click(screen.getByText("Check health"));
    const fetchRow = screen.getByText("fetch").closest("tr")!;
    await waitFor(() => expect(within(fetchRow).getAllByTitle("spawn failed").length).toBeGreaterThan(0));
    expect(within(fetchRow).getByText("Not checked")).toBeTruthy();
    // disabled servers are skipped
    const offRow = screen.getByText("off").closest("tr")!;
    expect(within(offRow).getByText("Not checked")).toBeTruthy();
    await waitFor(() => expect((screen.getByText("Check health") as HTMLButtonElement).disabled).toBe(false));
  });

  it("shows the empty state", async () => {
    installFakeApi({ servers: [] });
    renderWithToasts(<Dashboard />);
    expect(await screen.findByText("No servers in the hub yet")).toBeTruthy();
    screen.getByText("Import from an editor").click();
    expect(window.location.hash).toBe("#/import");
    screen.getByText("Add one by hand").click();
    expect(window.location.hash).toBe("#/add");
  });

  it("says the hub isn't answering when loading fails", async () => {
    installFakeApi({ fail: { "GET /api/targets": { status: 502 } } });
    renderWithToasts(<Dashboard />);
    expect(await screen.findByText("The hub isn't answering")).toBeTruthy();
  });

  it("also handles a servers failure, and the Add button navigates", async () => {
    installFakeApi({ fail: { "GET /api/servers": { status: 502 } } });
    renderWithToasts(<Dashboard />);
    expect(await screen.findByText("The hub isn't answering")).toBeTruthy();
    installFakeApi({ servers: [server({ id: "x" })] });
  });

  it("Add server button goes to the form", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<Dashboard />);
    await screen.findByText("fetch");
    await user.click(screen.getByText("Add server"));
    expect(window.location.hash).toBe("#/add");
  });
});
