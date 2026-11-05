import { describe, it, expect, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "./toast.tsx";
import "./test/render.tsx";

function Buttons() {
  const t = useToast();
  return (
    <>
      <button onClick={() => t.success("Saved", "detail")}>s</button>
      <button onClick={() => t.error("Broke")}>e</button>
      <button onClick={() => t.info("FYI")}>i</button>
    </>
  );
}

describe("toasts", () => {
  it("shows each kind and removes them after their timeout", () => {
    vi.useFakeTimers();
    render(<ToastProvider><Buttons /></ToastProvider>);
    act(() => { screen.getByText("s").click(); screen.getByText("e").click(); screen.getByText("i").click(); });
    expect(screen.getByText("Saved").parentElement).toHaveProperty("className", "toast toast-success");
    expect(screen.getByText("detail")).toBeTruthy();
    expect(screen.getByText("Broke").parentElement!.className).toBe("toast toast-error");
    expect(screen.getByText("FYI").parentElement!.className).toBe("toast toast-info");
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.queryByText("FYI")).toBeNull();
    expect(screen.getByText("Broke")).toBeTruthy(); // errors stay longer
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText("Broke")).toBeNull();
  });

  it("throws when used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow("useToast outside ToastProvider");
  });
});
