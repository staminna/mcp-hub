import { describe, it, expect, vi, afterEach } from "vitest";
import { api, launchLine, serverTargets } from "./api.ts";
import { installFakeApi, server } from "./test/fakeApi.ts";

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("calls every endpoint with the right method and path", async () => {
    const st = installFakeApi();
    expect(await api.servers()).toHaveLength(3);
    expect((await api.server("fetch")).id).toBe("fetch");
    expect((await api.createServer({ name: "New One" })).id).toBe("new-one");
    expect((await api.updateServer("fetch", { name: "f2" })).name).toBe("f2");
    expect((await api.toggleServer("fetch")).disabled).toBe(true);
    expect((await api.checkHealth("fetch")).status).toBe("healthy");
    expect(await api.deleteServer("fetch")).toBeUndefined();
    expect(await api.targets()).toHaveLength(2);
    expect((await api.syncTarget("cursor")).target).toBe("cursor");
    expect(await api.syncAll()).toHaveLength(2);
    expect((await api.diff()).targets).toHaveLength(2);
    expect(await api.discoverNpm("a b")).toHaveLength(1);
    expect(await api.discoverRunning()).toHaveLength(1);
    expect(await api.discoverRegistry()).toHaveLength(1);
    expect((await api.importFrom("cursor")).logs).toHaveLength(2);
    expect(await api.listContent("skills")).toHaveLength(2);
    expect(await api.listContent("memories")).toHaveLength(2);
    expect((await api.readContent("skills", "/s/beta/SKILL.md")).body).toBe("Plain beta");
    expect(await api.saveContent("skills", "/s/beta/SKILL.md", "x")).toEqual({ ok: true });

    const sent = st.calls.find((c) => c.method === "POST" && c.path === "/api/servers")!;
    expect(sent.body).toEqual({ name: "New One" });
    const getCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(getCall[1].headers).toBeUndefined();
    expect(getCall[1].body).toBeUndefined();
    const npmCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => String(c[0]).includes("npm"))!;
    expect(String(npmCall[0])).toBe("/api/discover/npm?q=a%20b");
  });

  it("uses the JSON error message when the server sends one", async () => {
    installFakeApi({ fail: { "GET /api/servers": { status: 400, body: '{"error":"name required"}' } } });
    await expect(api.servers()).rejects.toThrow("name required");
  });

  it("falls back to the raw text when the error isn't JSON", async () => {
    installFakeApi({ fail: { "GET /api/servers": { status: 500, body: "<h1>boom</h1>" } } });
    await expect(api.servers()).rejects.toThrow("<h1>boom</h1>");
  });

  it("keeps the raw text when the JSON error has no error field", async () => {
    installFakeApi({ fail: { "GET /api/servers": { status: 500, body: '{"message":"x"}' } } });
    await expect(api.servers()).rejects.toThrow('{"message":"x"}');
  });

  it("reports the status code when the error body is empty", async () => {
    installFakeApi({ fail: { "GET /api/servers": { status: 503 } } });
    await expect(api.servers()).rejects.toThrow("HTTP 503");
  });
});

describe("helpers", () => {
  it("serverTargets expands * to every target", () => {
    expect(serverTargets(server({ id: "a", targets: "*" }), ["cursor", "vscode"])).toEqual(["cursor", "vscode"]);
    expect(serverTargets(server({ id: "a", targets: ["gemini"] }), ["cursor"])).toEqual(["gemini"]);
  });

  it("launchLine shows the command for stdio and the URL otherwise", () => {
    expect(launchLine(server({ id: "a", command: "npx", args: ["-y", "x"] }))).toBe("npx -y x");
    expect(launchLine(server({ id: "a", command: "node", args: undefined }))).toBe("node");
    expect(launchLine(server({ id: "a", command: undefined, args: undefined }))).toBe("");
    expect(launchLine(server({ id: "a", transport: "sse", url: "https://x" }))).toBe("https://x");
    expect(launchLine(server({ id: "a", transport: "sse", url: undefined }))).toBe("");
  });
});
