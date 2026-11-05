import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Import } from "./Import.tsx";
import { installFakeApi } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

describe("Import", () => {
  it("imports from an editor and shows the log without colour codes", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<Import />);
    expect(((await screen.findByText("Choose an editor")) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Cursor/) as HTMLInputElement).disabled).toBe(true); // not found
    expect(screen.getByText("~/.cursor/mcp.json not found")).toBeTruthy();
    await user.click(screen.getByLabelText(/Claude Code/));
    await user.click(screen.getByText("Import from Claude Code"));
    expect(await screen.findByText("Import finished")).toBeTruthy();
    expect(screen.getByText(/\+ fetch/).textContent).not.toContain("\x1b");
    expect(st.calls.some((c) => c.path === "/api/import/claude-code")).toBe(true);
  });

  it("says when there was nothing new", async () => {
    installFakeApi({ importLogs: [] });
    const { user } = renderWithToasts(<Import />);
    await user.click(await screen.findByLabelText(/Claude Code/));
    await user.click(screen.getByText("Import from Claude Code"));
    expect(await screen.findByText("Nothing new to import.")).toBeTruthy();
  });

  it("reports a failed import", async () => {
    installFakeApi({ fail: { "POST /api/import/claude-code": { status: 500, body: "boom" } } });
    const { user } = renderWithToasts(<Import />);
    await user.click(await screen.findByLabelText(/Claude Code/));
    await user.click(screen.getByText("Import from Claude Code"));
    expect(await screen.findByText("Import failed")).toBeTruthy();
  });
});
