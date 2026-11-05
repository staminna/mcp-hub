import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { ServerDetail } from "./ServerDetail.tsx";
import { installFakeApi, server } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

describe("ServerDetail", () => {
  it("shows a remote server with env refs and copies its JSON", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<ServerDetail id="remote" />);
    await screen.findByText("remote", { selector: "h1" });
    expect(screen.getByText("URL")).toBeTruthy();
    expect(screen.getByText("Every editor:")).toBeTruthy();
    expect(screen.getByText("${REMOTE_TOKEN}")).toBeTruthy();
    expect(screen.getByText("(filled in from .env at sync)")).toBeTruthy();
    expect(screen.getByText("fast")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy(); // no tags
    await user.click(screen.getByText("Copy"));
    // user-event installs a fake clipboard on navigator
    expect(await navigator.clipboard.readText()).toContain('"id": "remote"');
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("shows a stdio server with tags, cwd and specific editors; copy works without a clipboard", async () => {
    installFakeApi({ servers: [server({ id: "s", tags: ["t"], cwd: "/work", targets: ["cursor", "gemini"], description: "Desc" })] });
    const { user } = renderWithToasts(<ServerDetail id="s" />);
    Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
    await screen.findByText("Desc");
    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("/work")).toBeTruthy();
    expect(screen.getByText("t")).toBeTruthy();
    expect(screen.getByText("Cursor")).toBeTruthy();
    expect(screen.getByText("gemini")).toBeTruthy(); // unknown target falls back to its name
    expect(screen.getByText("No environment variables.")).toBeTruthy();
    await user.click(screen.getByText("Copy"));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("explains a disabled server and one with no editors", async () => {
    installFakeApi({ servers: [server({ id: "d", disabled: true, targets: [] })] });
    renderWithToasts(<ServerDetail id="d" />);
    expect(await screen.findByText("Disabled: sync leaves it as it is in your editors.")).toBeTruthy();
    expect(screen.getByText("No editors")).toBeTruthy();
  });

  it("says when the server doesn't exist", async () => {
    installFakeApi();
    renderWithToasts(<ServerDetail id="ghost" />);
    expect(await screen.findByText("No server called “ghost”")).toBeTruthy();
  });

  it("checks health, including errors", async () => {
    let release!: () => void;
    const st = installFakeApi({
      health: { fetch: { serverId: "fetch", status: "unhealthy", error: "Exit code: 1", checkedAt: "" } },
      delay: { "POST /api/servers/fetch/health": new Promise<void>((r) => (release = r)) },
    });
    const { user } = renderWithToasts(<ServerDetail id="fetch" />);
    await screen.findByText("Check now");
    await user.click(screen.getByText("Check now"));
    expect(screen.getByText("Checking…")).toBeTruthy();
    release();
    expect(await screen.findByText("Exit code: 1")).toBeTruthy();
    st.fail["POST /api/servers/fetch/health"] = { status: 500, body: "gone" };
    await user.click(screen.getByText("Check now"));
    expect(await screen.findByText("gone")).toBeTruthy();
    expect(screen.getByText("Not checked")).toBeTruthy();
  });

  it("health without an error shows no error line", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<ServerDetail id="fetch" />);
    await user.click(await screen.findByText("Check now"));
    expect(await screen.findByText("Healthy")).toBeTruthy();
  });

  it("edits and saves, keeping fields the form doesn't show", async () => {
    const st = installFakeApi({ servers: [server({ id: "fetch", disabledTools: ["x"], disabled: true })] });
    const { user } = renderWithToasts(<ServerDetail id="fetch" />);
    await user.click(await screen.findByText("Edit"));
    expect(screen.getByText("Edit fetch")).toBeTruthy();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Fetch 2");
    await user.click(screen.getByText("Save changes"));
    expect(await screen.findByText("Fetch 2", { selector: "h1" })).toBeTruthy();
    const put = st.calls.find((c) => c.method === "PUT")!;
    expect(put.body).toMatchObject({ name: "Fetch 2", disabled: true, disabledTools: ["x"] });
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("reports a failed save and can cancel editing", async () => {
    installFakeApi({ fail: { "PUT /api/servers/fetch": { status: 400, body: '{"error":"name required"}' } } });
    const { user } = renderWithToasts(<ServerDetail id="fetch" />);
    await user.click(await screen.findByText("Edit"));
    await user.click(screen.getByText("Save changes"));
    expect(await screen.findByText("name required")).toBeTruthy();
    await user.click(screen.getByText("Cancel"));
    expect(screen.getByText("Remove")).toBeTruthy();
  });

  it("removes after confirming, or reports the failure", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<ServerDetail id="fetch" />);
    await user.click(await screen.findByText("Remove"));
    st.fail["DELETE /api/servers/fetch"] = { status: 500, body: "locked" };
    await user.click(screen.getByText("Remove from hub"));
    expect(await screen.findByText("locked")).toBeTruthy();
    delete st.fail["DELETE /api/servers/fetch"];
    await user.click(screen.getByText("Remove"));
    await user.click(screen.getByText("Remove from hub"));
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(st.servers.find((s) => s.id === "fetch")).toBeUndefined();
  });
});
