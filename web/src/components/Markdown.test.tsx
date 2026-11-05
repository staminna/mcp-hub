import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "./Markdown.tsx";
import "../test/render.tsx";

describe("Markdown", () => {
  it("renders markdown and strips scripts", () => {
    const { container } = render(<Markdown source={"# Title\n\n<script>alert(1)</script><b onclick=\"x()\">bold</b>"} />);
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")?.getAttribute("onclick")).toBeNull();
  });
});
