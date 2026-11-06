import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { AddServer } from "./AddServer.tsx";
import { setPrefill, takePrefill } from "../prefill.ts";
import { installFakeApi } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

describe("AddServer", () => {
  it("adds a server and opens it", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<AddServer />);
    await user.type(await screen.findByLabelText("Name"), "My Server");
    await user.type(screen.getByLabelText("Command"), "npx");
    expect((screen.getByLabelText("Every editor") as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByText("Add server", { selector: "button" }));
    await waitFor(() => expect(window.location.hash).toBe("#/server/my-server"));
    expect(st.calls.find((c) => c.method === "POST")!.body).toMatchObject({ name: "My Server", targets: "*" });
  });

  it("uses a prefill from Find servers exactly once", async () => {
    installFakeApi();
    setPrefill({ name: "github", command: "npx", args: ["-y", "gh"], targets: "*" });
    renderWithToasts(<AddServer />);
    expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe("github");
    expect(takePrefill()).toBeNull();
  });

  it("reports a failed add and cancel goes back", async () => {
    installFakeApi({ fail: { "POST /api/servers": { status: 400, body: '{"error":"exists"}' } } });
    const { user } = renderWithToasts(<AddServer />);
    await user.type(await screen.findByLabelText("Name"), "x");
    await user.type(screen.getByLabelText("Command"), "npx");
    await user.click(screen.getByText("Add server", { selector: "button" }));
    expect(await screen.findByText("exists")).toBeTruthy();
    await user.click(screen.getByText("Cancel"));
    expect(window.location.hash).toBe("#/");
  });

  it("fills the form from a pasted entry", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<AddServer />);
    const box = await screen.findByLabelText(/^Paste a config/);
    await user.click(box);
    await user.paste(`"arkestra": { "command": "npx", "args": ["-y", "mcp-remote", "http://localhost:9315/mcp"] }`);
    await user.click(screen.getByText("Read config"));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("arkestra");
    expect((screen.getByLabelText("Command") as HTMLInputElement).value).toBe("npx");
    expect((screen.getByLabelText("Arguments, one per line") as HTMLTextAreaElement).value).toBe("-y\nmcp-remote\nhttp://localhost:9315/mcp");
    await user.click(screen.getByText("Add server", { selector: "button" }));
    await waitFor(() => expect(window.location.hash).toBe("#/server/arkestra"));
    expect(st.calls.find((c) => c.method === "POST")!.body).toMatchObject({ name: "arkestra", args: ["-y", "mcp-remote", "http://localhost:9315/mcp"] });
  });

  it("explains a bad paste", async () => {
    installFakeApi();
    const { user } = renderWithToasts(<AddServer />);
    await user.click(await screen.findByLabelText(/^Paste a config/));
    await user.paste(`"a": {`);
    await user.click(screen.getByText("Read config"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't valid JSON/);
  });

  it("adds every server from a pasted mcpServers block", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<AddServer />);
    await user.click(await screen.findByLabelText(/^Paste a config/));
    await user.paste(`{"mcpServers": {"one": {"command": "a"}, "two": {"url": "https://t"}}}`);
    await user.click(screen.getByText("Read config"));
    await user.click(await screen.findByText(/Add all 2: one, two/));
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(st.calls.filter((c) => c.method === "POST").map((c) => (c.body as { name: string }).name)).toEqual(["one", "two"]);
  });

  it("reports which pasted servers couldn't be added", async () => {
    installFakeApi({ fail: { "POST /api/servers": { status: 400, body: '{"error":"nope"}' } } });
    const { user } = renderWithToasts(<AddServer />);
    window.location.hash = "#/add";
    await user.click(await screen.findByLabelText(/^Paste a config/));
    await user.paste(`{"one": {"command": "a"}, "two": {"command": "b"}}`);
    await user.click(screen.getByText("Read config"));
    await user.click(await screen.findByText(/Add all 2/));
    expect(await screen.findByText("Couldn't add 2 of 2")).toBeTruthy();
    expect(window.location.hash).toBe("#/add");
  });
});
