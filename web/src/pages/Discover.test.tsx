import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Discover } from "./Discover.tsx";
import { takePrefill } from "../prefill.ts";
import { installFakeApi } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

describe("Discover (Find servers)", () => {
  it("lists popular servers and hands one to the Add form", async () => {
    installFakeApi({
      registry: [
        { name: "@modelcontextprotocol/server-filesystem", source: "registry", description: "Files" },
        { name: "github-mcp-server", source: "registry" },
        { name: "plain", source: "registry" },
      ],
    });
    const { user } = renderWithToasts(<Discover />);
    expect(await screen.findByText("Files")).toBeTruthy();
    const buttons = screen.getAllByText("Use this");
    await user.click(buttons[0]);
    expect(window.location.hash).toBe("#/add");
    expect(takePrefill()).toMatchObject({ name: "filesystem", description: "Files", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] });
    await user.click(buttons[1]);
    expect(takePrefill()!.name).toBe("github");
    await user.click(buttons[2]);
    expect(takePrefill()!.name).toBe("plain");
  });

  it("searches npm and shows no-result states", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<Discover />);
    await screen.findByText("Files");
    await user.click(screen.getByRole("tab", { name: "Search npm" }));
    expect(screen.getByText("Search npm for MCP servers")).toBeTruthy();
    const box = screen.getByLabelText("Search npm");
    await user.clear(box);
    await user.click(screen.getByText("Search", { selector: "button" }));
    expect(st.calls.some((c) => c.path === "/api/discover/npm")).toBe(false); // empty query ignored
    await user.type(box, " postgres ");
    await user.click(screen.getByText("Search", { selector: "button" }));
    expect(await screen.findByText("postgres-mcp-server")).toBeTruthy();
    st.npm = [];
    await user.click(screen.getByText("Search", { selector: "button" }));
    expect(await screen.findByText("Nothing found")).toBeTruthy();
  });

  it("scans running processes and rescans", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<Discover />);
    await screen.findByText("Files");
    await user.click(screen.getByRole("tab", { name: "Running on this Mac" }));
    expect(await screen.findByText("node mcp.js")).toBeTruthy();
    st.running = [];
    await user.click(screen.getByText("Scan again"));
    expect(await screen.findByText("No MCP processes running")).toBeTruthy();
    // switching back reuses the cached registry result
    const before = st.calls.filter((c) => c.path === "/api/discover/registry").length;
    await user.click(screen.getByRole("tab", { name: "Popular" }));
    expect(st.calls.filter((c) => c.path === "/api/discover/registry").length).toBe(before);
  });

  it("reports a failed search", async () => {
    installFakeApi({ fail: { "GET /api/discover/registry": { status: 500, body: "offline" } } });
    renderWithToasts(<Discover />);
    expect(await screen.findByText("Search failed")).toBeTruthy();
  });

  it("a process without a description still renders", async () => {
    installFakeApi({ running: [{ name: "p", source: "process" }] });
    const { user } = renderWithToasts(<Discover />);
    await user.click(screen.getByRole("tab", { name: "Running on this Mac" }));
    expect(await screen.findByRole("listitem")).toBeTruthy();
  });
});
