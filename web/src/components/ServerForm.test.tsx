import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServerForm } from "./ServerForm.tsx";
import type { TargetInfo } from "../api.ts";
import "../test/render.tsx";

const targets: TargetInfo[] = [
  { name: "claude-code", label: "Claude Code", icon: "", path: "", exists: true },
  { name: "cursor", label: "Cursor", icon: "", path: "", exists: true },
];

function setup(initial?: Parameters<typeof ServerForm>[0]["initial"]) {
  const user = userEvent.setup();
  const onSubmit = vi.fn(async () => {});
  const onCancel = vi.fn();
  render(<ServerForm initial={initial} targets={targets} submitLabel="Go" onSubmit={onSubmit} onCancel={onCancel} />);
  return { user, onSubmit, onCancel };
}

const field = (label: string) => screen.getByLabelText(label, { exact: false }) as HTMLInputElement;

describe("ServerForm", () => {
  it("validates name, command and URL before submitting", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByText("Go"));
    expect(screen.getByRole("alert").textContent).toBe("Give the server a name.");
    await user.type(field("Name"), "fs");
    await user.click(screen.getByText("Go"));
    expect(screen.getByRole("alert").textContent).toMatch(/needs a command/);
    await user.selectOptions(field("Transport"), "sse");
    await user.click(screen.getByText("Go"));
    expect(screen.getByRole("alert").textContent).toBe("A remote server needs a URL.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a stdio server with parsed args, env, tags and chosen targets", async () => {
    const { user, onSubmit, onCancel } = setup();
    expect(document.activeElement).toBe(field("Name"));
    await user.type(field("Name"), "  fs  ");
    await user.type(field("Description"), "Files");
    await user.type(field("Command"), "npx");
    await user.type(field("Working directory"), "/tmp");
    await user.type(field("Arguments"), "-y{enter}  pkg  {enter}{enter}");
    await user.type(field("Environment"), "A=1{enter}bad line{enter}=nokey{enter} B = two = 2 ");
    await user.type(field("Tags"), "a, ,b");
    await user.click(screen.getByLabelText("Cursor"));
    await user.click(screen.getByLabelText("Claude Code"));
    await user.click(screen.getByLabelText("Claude Code"));
    await user.click(screen.getByText("Go"));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "fs",
      description: "Files",
      transport: "stdio",
      command: "npx",
      args: ["-y", "pkg"],
      cwd: "/tmp",
      url: undefined,
      env: { A: "1", B: "two = 2" },
      tags: ["a", "b"],
      targets: ["cursor"],
    });
    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("submits a remote server with every editor and no optional fields", async () => {
    const { user, onSubmit } = setup();
    await user.type(field("Name"), "r");
    await user.selectOptions(field("Transport"), "streamable-http");
    await user.type(field("URL"), " https://x/mcp ");
    await user.click(screen.getByLabelText("Every editor"));
    expect((screen.getByLabelText("Cursor") as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByText("Go"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      transport: "streamable-http", url: "https://x/mcp", command: undefined, args: undefined, cwd: undefined,
      description: undefined, env: undefined, tags: [], targets: "*",
    }));
  });

  it("prefills from an existing server", async () => {
    const { user, onSubmit } = setup({
      name: "keep", transport: "stdio", command: "node", args: ["a", "b"], cwd: "/w",
      env: { K: "${V}" }, tags: ["x", "y"], targets: ["cursor"], description: "d",
    });
    expect(document.activeElement).not.toBe(field("Name"));
    expect(field("Arguments").value).toBe("a\nb");
    expect(field("Environment").value).toBe("K=${V}");
    expect(field("Tags").value).toBe("x, y");
    expect((screen.getByLabelText("Cursor") as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByText("Go"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "keep", cwd: "/w", targets: ["cursor"] }));
  });

  it("prefills a server that syncs everywhere", () => {
    setup({ name: "all", targets: "*" });
    expect((screen.getByLabelText("Every editor") as HTMLInputElement).checked).toBe(true);
  });
});
