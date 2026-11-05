import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

// The dashboard is built into dist/web and served by `mcp-hub serve`.
// In dev (`npm run dev:web`) Vite serves it on :5173 and proxies /api to `serve`.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("../dist/web", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    proxy: { "/api": "http://localhost:3847" },
  },
});
