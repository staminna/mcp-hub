import { describe, it, expect } from "vitest";
import { act, screen } from "@testing-library/react";
import { App } from "./App.tsx";
import { installFakeApi } from "./test/fakeApi.ts";
import { renderWithToasts } from "./test/render.tsx";

const go = async (hash: string) => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
};

describe("App", () => {
  it("routes to every page and highlights the nav", async () => {
    installFakeApi();
    renderWithToasts(<App />);
    expect(await screen.findByText("3 in the hub, 2 enabled. Each dot is an editor the server is synced to.")).toBeTruthy();
    expect(screen.getByText("Servers", { selector: "a" }).getAttribute("aria-current")).toBe("page");

    const pages: [string, string][] = [
      ["#/server/fetch", "Check now"],
      ["#/add", "Add server"],
      ["#/targets", "Sync all"],
      ["#/diff", "Go to sync"],
      ["#/import", "Choose an editor"],
      ["#/discover", "Popular"],
      ["#/skills", "Pick a skill"],
      ["#/memories", "Pick a memory"],
      ["#/nowhere", "There's no page here"],
    ];
    for (const [hash, text] of pages) {
      await go(hash);
      expect(await screen.findAllByText(text)).not.toHaveLength(0);
    }
    await go("#/server/fetch");
    // Servers stays highlighted on its sub-pages, but isn't the current page
    const servers = screen.getByText("Servers", { selector: "a" });
    expect(servers.className).toContain("active");
    expect(servers.getAttribute("aria-current")).toBeNull();
  });
});
