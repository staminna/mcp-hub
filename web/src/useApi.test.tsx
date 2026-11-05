import { describe, it, expect } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { useApi } from "./useApi.ts";
import { renderWithToasts } from "./test/render.tsx";

function Probe({ load }: { load: () => Promise<string> }) {
  const r = useApi(load, "Load failed");
  return (
    <div>
      <span data-testid="data">{r.data ?? "none"}</span>
      <span data-testid="error">{r.error ?? "ok"}</span>
      <button onClick={() => r.reload()}>reload</button>
      <button onClick={() => r.setData("manual")}>set</button>
    </div>
  );
}

describe("useApi", () => {
  it("loads data, reloads and lets callers set it", async () => {
    let n = 0;
    const { user } = renderWithToasts(<Probe load={async () => `v${++n}`} />);
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("v1"));
    await user.click(screen.getByText("reload"));
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("v2"));
    await user.click(screen.getByText("set"));
    expect(screen.getByTestId("data").textContent).toBe("manual");
  });

  it("records the error and shows a toast", async () => {
    renderWithToasts(<Probe load={() => Promise.reject(new Error("nope"))} />);
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("nope"));
    expect(screen.getByText("Load failed")).toBeTruthy();
    await act(async () => {});
  });
});
