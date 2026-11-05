import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { Secrets } from "./Secrets.tsx";
import { installFakeApi } from "../test/fakeApi.ts";
import { renderWithToasts } from "../test/render.tsx";

const row = (name: string) => screen.getByText(name, { selector: ".target-name" }).closest("li")!;

describe("Secrets", () => {
  it("lists variables with status and users, never values", async () => {
    installFakeApi();
    renderWithToasts(<Secrets />);
    await screen.findByText("REMOTE_TOKEN");
    expect(within(row("REMOTE_TOKEN")).getByText("Missing")).toBeTruthy();
    expect(within(row("SHELL_VAR")).getByText("From your shell environment")).toBeTruthy();
    expect(within(row("SHELL_VAR")).getByText("Not used by any server")).toBeTruthy();
    expect(within(row("STRIPE_KEY")).getByText("Set")).toBeTruthy();
    expect(within(row("STRIPE_KEY")).getByText("remote").closest("a")!.getAttribute("href")).toBe("#/server/remote");
    expect(screen.getByText(/1 variable is missing/)).toBeTruthy();
    expect(within(row("REMOTE_TOKEN")).queryByText("Remove")).toBeNull(); // only .env keys can be removed
  });

  it("sets a missing value with a password field, then clears it", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<Secrets />);
    await screen.findByText("REMOTE_TOKEN");
    await user.click(within(row("REMOTE_TOKEN")).getByText("Set"));
    const input = screen.getByLabelText("Value for REMOTE_TOKEN") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    await user.type(input, "tok_123");
    await user.click(screen.getByText("Save"));
    expect(await screen.findByText("Saved to .env")).toBeTruthy();
    expect(st.secretValues.REMOTE_TOKEN).toBe("tok_123");
    expect(await within(row("REMOTE_TOKEN")).findByText("Set")).toBeTruthy();
    expect(screen.queryByDisplayValue("tok_123")).toBeNull();
    expect(screen.queryByText(/missing\. Servers/)).toBeNull();
  });

  it("replaces, cancels, and reports save errors", async () => {
    installFakeApi({ fail: { "PUT /api/secrets/STRIPE_KEY": { status: 400, body: JSON.stringify({ error: "A value can't contain line breaks" }) } } });
    const { user } = renderWithToasts(<Secrets />);
    await screen.findByText("STRIPE_KEY");
    await user.click(within(row("STRIPE_KEY")).getByText("Replace"));
    await user.click(screen.getByText("Cancel"));
    expect(screen.queryByLabelText("Value for STRIPE_KEY")).toBeNull();
    await user.click(within(row("STRIPE_KEY")).getByText("Replace"));
    await user.type(screen.getByLabelText("Value for STRIPE_KEY"), "x");
    await user.click(screen.getByText("Save"));
    expect(await screen.findByText("Couldn't save STRIPE_KEY")).toBeTruthy();
    expect(screen.getByText("A value can't contain line breaks")).toBeTruthy();
  });

  it("removes a key after confirming, and reports failures", async () => {
    const st = installFakeApi();
    const { user } = renderWithToasts(<Secrets />);
    await screen.findByText("STRIPE_KEY");
    await user.click(within(row("STRIPE_KEY")).getByText("Remove"));
    await user.click(screen.getByText("Remove STRIPE_KEY"));
    expect(await screen.findByText("Removed from .env")).toBeTruthy();
    expect(st.calls.some((c) => c.method === "DELETE" && c.path === "/api/secrets/STRIPE_KEY")).toBe(true);
  });

  it("reports a failed removal", async () => {
    installFakeApi({
      secrets: [{ name: "OLD", source: "env-file", usedBy: [] }],
      fail: { "DELETE /api/secrets/OLD": { status: 404, body: JSON.stringify({ error: "Not in .env" }) } },
    });
    const { user } = renderWithToasts(<Secrets />);
    await screen.findByText("OLD");
    await user.click(screen.getByText("Remove"));
    await user.click(screen.getByText("Remove OLD"));
    expect(await screen.findByText("Couldn't remove OLD")).toBeTruthy();
  });

  it("adds a new variable after checking its name", async () => {
    const st = installFakeApi({ secrets: [] });
    const { user } = renderWithToasts(<Secrets />);
    expect(await screen.findByText(/No servers use a/)).toBeTruthy();
    const name = screen.getByLabelText("Variable name");
    await user.type(name, "1bad");
    expect(screen.getByText(/Letters, digits and _ only/)).toBeTruthy();
    expect((screen.getByText("Next") as HTMLButtonElement).disabled).toBe(true);
    await user.clear(name);
    await user.type(name, "GITHUB_TOKEN");
    await user.click(screen.getByText("Next"));
    await user.click(screen.getByText("Cancel"));
    await user.click(screen.getByText("Next"));
    await user.type(screen.getByLabelText("Value for GITHUB_TOKEN"), "ghp_x");
    await user.click(screen.getByText("Save"));
    expect(await screen.findByText("GITHUB_TOKEN", { selector: ".target-name" })).toBeTruthy();
    expect(st.secretValues.GITHUB_TOKEN).toBe("ghp_x");
    expect((screen.getByLabelText("Variable name") as HTMLInputElement).value).toBe("");
  });

  it("says when several variables are missing", async () => {
    installFakeApi({ secrets: [
      { name: "A", source: "missing", usedBy: ["x"] },
      { name: "B", source: "missing", usedBy: ["y"] },
    ] });
    renderWithToasts(<Secrets />);
    expect(await screen.findByText(/2 variables are missing/)).toBeTruthy();
  });
});
