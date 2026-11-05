import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { installFakeApi } from "./test/fakeApi.ts";
import "./test/render.tsx";

describe("main", () => {
  it("mounts the app into #root", async () => {
    installFakeApi();
    document.body.innerHTML = '<div id="root"></div>';
    await import("./main.tsx");
    expect(await screen.findByText("MCP Hub")).toBeTruthy();
  });
});
