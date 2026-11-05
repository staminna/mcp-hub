import { describe, it, expect, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { matchRoute, navigate, useRoute } from "./router.ts";

afterEach(() => { window.location.hash = ""; });

describe("router", () => {
  it("matches every route", () => {
    expect(matchRoute("")).toEqual({ view: "dashboard" });
    expect(matchRoute("#/")).toEqual({ view: "dashboard" });
    expect(matchRoute("#/server/a%20b")).toEqual({ view: "server", id: "a b" });
    for (const v of ["add", "targets", "diff", "import", "discover", "skills", "memories"]) {
      expect(matchRoute(`#/${v}`)).toEqual({ view: v });
    }
    expect(matchRoute("#/nope")).toEqual({ view: "404" });
  });

  it("follows hash changes and stops listening on unmount", async () => {
    const { result, unmount } = renderHook(() => useRoute());
    expect(result.current.view).toBe("dashboard");
    await act(async () => {
      navigate("#/skills");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.view).toBe("skills");
    unmount();
    navigate("#/diff");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(window.location.hash).toBe("#/diff");
  });
});
