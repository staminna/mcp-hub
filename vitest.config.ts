import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.ts", "web/src/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    environmentMatchGlobs: [["web/**", "jsdom"]],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "web/src/**/*.{ts,tsx}"],
      // types.ts holds only types (no runtime code); tests aren't measured
      exclude: ["src/types.ts", "**/*.test.{ts,tsx}", "web/src/test/**"],
      reporter: ["text", "html"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 95 },
    },
  },
});
