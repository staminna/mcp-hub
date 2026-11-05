import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmButton, Empty, Lamp, Loading, PageHeader, Spinner, Tag, syncSummary } from "./ui.tsx";
import "../test/render.tsx";

const base = { added: [], updated: [], unmanaged: [], skipped: [] };

describe("ui", () => {
  it("renders the simple pieces", () => {
    render(
      <>
        <Spinner />
        <Loading label="Wait" />
        <Lamp status="healthy" />
        <Lamp status="unhealthy" title="custom" />
        <Lamp status="unknown" />
        <Lamp status="checking" />
        <Tag>t1</Tag>
        <Empty title="Nothing" />
        <Empty title="Full" action={<button>act</button>}>why</Empty>
        <PageHeader title="Head" />
        <PageHeader title="Head2" subtitle="sub" actions={<button>go</button>} />
      </>,
    );
    expect(screen.getByText("Wait")).toBeTruthy();
    expect(screen.getByTitle("Healthy")).toBeTruthy();
    expect(screen.getByTitle("custom").textContent).toBe("Unhealthy");
    expect(screen.getByText("Not checked")).toBeTruthy();
    expect(screen.getByText("Checking…")).toBeTruthy();
    expect(screen.getByText("why")).toBeTruthy();
    expect(screen.getByText("sub")).toBeTruthy();
    expect(screen.getByText("go")).toBeTruthy();
  });

  it("ConfirmButton needs a second click, and Keep backs out", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmButton onConfirm={onConfirm} confirmLabel="Really">Delete</ConfirmButton>);
    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("Keep"));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("Really"));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByText("Delete").className).toBe("btn btn-danger");
  });

  it("syncSummary covers each outcome", () => {
    expect(syncSummary({ ...base, error: "bad" })).toBe("bad");
    expect(syncSummary(base)).toBe("Already in sync");
    expect(syncSummary({ added: ["a"], updated: ["b", "c"], unmanaged: ["d"], skipped: [{ id: "e" }, { id: "f" }] })).toBe(
      "1 added, 2 updated, 1 unmanaged kept, 2 skipped (missing .env vars: e, f)",
    );
  });
});
