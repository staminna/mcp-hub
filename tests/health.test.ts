import { describe, it, expect } from "vitest";
import { formatHealthResults } from "../src/health/reporter.js";
import { type HealthResult } from "../src/types.js";

describe("health reporter", () => {
  it("formats healthy results", () => {
    const results: HealthResult[] = [
      {
        serverId: "test-server",
        status: "healthy",
        responseTimeMs: 42,
        checkedAt: "2024-01-01T00:00:00Z",
      },
    ];
    const output = formatHealthResults(results);
    expect(output).toContain("✓");
    expect(output).toContain("test-server");
    expect(output).toContain("42ms");
    expect(output).toContain("1/1 healthy");
  });

  it("formats unhealthy results", () => {
    const results: HealthResult[] = [
      {
        serverId: "broken",
        status: "unhealthy",
        error: "Connection refused",
        checkedAt: "2024-01-01T00:00:00Z",
      },
    ];
    const output = formatHealthResults(results);
    expect(output).toContain("✗");
    expect(output).toContain("Connection refused");
    expect(output).toContain("0/1 healthy");
  });

  it("formats mixed results", () => {
    const results: HealthResult[] = [
      { serverId: "a", status: "healthy", responseTimeMs: 10, checkedAt: "" },
      { serverId: "b", status: "unhealthy", error: "timeout", checkedAt: "" },
      { serverId: "c", status: "healthy", responseTimeMs: 20, checkedAt: "" },
    ];
    const output = formatHealthResults(results);
    expect(output).toContain("2/3 healthy");
  });
});
