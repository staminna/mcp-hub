import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "http";
import { serveCommand } from "../src/cli/commands/serve.js";
import { captureLog } from "./helpers.js";

const portOf = (s: Server) => { const a = s.address(); return typeof a === "object" && a ? a.port : 0; };

afterEach(() => { process.exitCode = 0; });

describe("serve", () => {
  it("starts the dashboard and announces the URL", async () => {
    let srv: Server | undefined;
    const out = await captureLog(async () => { srv = await serveCommand({ port: 0 }); });
    expect(out).toMatch(/dashboard running at http:\/\/localhost:0/);
    expect((await fetch(`http://127.0.0.1:${portOf(srv!)}/api/targets`)).status).toBe(200);
    srv!.close();
  });

  it("watches the config when asked, and stops when the server closes", async () => {
    let srv: Server | undefined;
    const out = await captureLog(async () => { srv = await serveCommand({ port: 0, watch: "review" }); });
    expect(out).toMatch(/changes are reported, not written/);
    await new Promise((r) => srv!.close(r));
    const auto = await captureLog(async () => { srv = await serveCommand({ port: 0, watch: "auto" }); });
    expect(auto).toMatch(/editors sync on change, once the config is valid/);
    await new Promise((r) => srv!.close(r));
  });

  it("explains a busy port instead of crashing", async () => {
    const busy = createServer().listen(0, "127.0.0.1");
    await new Promise((r) => busy.once("listening", r));
    const errors: string[] = [];
    const orig = console.error;
    console.error = (m: string) => errors.push(m);
    try {
      await expect(serveCommand({ port: portOf(busy) })).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      console.error = orig;
      busy.close();
    }
    expect(errors.join()).toMatch(/already in use/);
    expect(process.exitCode).toBe(1);
  });

  it("passes other listen errors through", async () => {
    await expect(serveCommand({ port: -5 })).rejects.toThrow();
  });
});
