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
});
