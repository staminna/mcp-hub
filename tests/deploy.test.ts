import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { parse } from "yaml";

// ── node-ssh fake: an in-memory remote filesystem ─────────────────────────
const remote = vi.hoisted(() => ({
  files: new Map<string, string>(),
  commands: [] as string[],
  failWrite: false,
  connectError: null as Error | null,
  disposed: 0,
  connectOpts: null as unknown,
}));
vi.mock("node-ssh", () => ({
  NodeSSH: class {
    async connect(opts: unknown) {
      remote.connectOpts = opts;
      if (remote.connectError) throw remote.connectError;
    }
    async execCommand(cmd: string, opts: { stdin?: string } = {}) {
      remote.commands.push(cmd);
      const cat = cmd.match(/^cat '([^']+)'$/);
      if (cat) {
        const f = remote.files.get(cat[1]);
        return f === undefined ? { code: 1, stdout: "", stderr: "No such file" } : { code: 0, stdout: f, stderr: "" };
      }
      if (remote.failWrite) return { code: 1, stdout: "", stderr: remote.failWrite === true ? "disk full" : "" };
      const target = cmd.match(/mv '(?:[^']|'\\'')+' '((?:[^']|'\\'')+)'$/)![1].replace(/'\\''/g, "'");
      remote.files.set(target, opts.stdin ?? "");
      return { code: 0, stdout: "", stderr: "" };
    }
    dispose() { remote.disposed++; }
  },
}));

// ── kubectl fake ──────────────────────────────────────────────────────────
const kube = vi.hoisted(() => ({ calls: [] as { cmd: string; args: string[]; input: string }[], code: 0, stderr: "", spawnError: null as Error | null }));
vi.mock("child_process", async (orig) => ({
  ...(await orig<typeof import("child_process")>()),
  spawn: (cmd: string, args: string[]) => {
    const proc = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough };
    proc.stdin = new PassThrough();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    let input = "";
    proc.stdin.on("data", (d) => (input += d));
    proc.stdin.on("finish", () => {
      kube.calls.push({ cmd, args, input });
      if (kube.spawnError) return proc.emit("error", kube.spawnError);
      if (kube.code === 0) proc.stdout.write("configmap/x configured\n");
      else proc.stderr.write(kube.stderr);
      setImmediate(() => proc.emit("close", kube.code));
    });
    return proc;
  },
}));

import { deployViaSSH } from "../src/deploy/ssh.js";
import { deployToK8s } from "../src/deploy/kubernetes.js";
import { HUB_ENV_PATH } from "../src/config/defaults.js";
import { server, config, write, remove } from "./helpers.js";

const hub = config([
  server({ id: "plain" }),
  server({ id: "secret", env: { TOKEN: "${DEPLOY_TOKEN}" } }),
  server({ id: "missing", env: { TOKEN: "${NOT_SET_FOR_DEPLOY}" } }),
  server({ id: "off", disabled: true }),
]);

beforeEach(() => {
  remote.files.clear();
  remote.commands = [];
  remote.failWrite = false;
  remote.connectError = null;
  remote.disposed = 0;
  kube.calls = [];
  kube.code = 0;
  kube.spawnError = null;
  write(HUB_ENV_PATH, "DEPLOY_TOKEN=real-value\n");
  return () => remove(HUB_ENV_PATH);
});

describe("deployViaSSH", () => {
  const path = "/home/deploy/.cursor/mcp.json";

  it("merges into the remote file, keeping its other servers and keys", async () => {
    remote.files.set(path, JSON.stringify({ theme: "dark", mcpServers: { theirs: { command: "t" } } }));
    const msg = await deployViaSSH(hub, "cursor", "box", { username: "deploy", keyPath: "/k" });
    const out = JSON.parse(remote.files.get(path)!);
    expect(out.theme).toBe("dark");
    expect(Object.keys(out.mcpServers).sort()).toEqual(["plain", "secret", "theirs"]);
    expect(out.mcpServers.secret.env.TOKEN).toBe("real-value");
    expect(msg).toBe(`Deployed 2 servers to box:${path} (skipped, missing in .env: missing)`);
    expect(remote.connectOpts).toEqual({ host: "box", username: "deploy", privateKeyPath: "/k" });
    expect(remote.disposed).toBe(1);
  });

  it("creates the remote file when there is none, and uses /root for root", async () => {
    const msg = await deployViaSSH(config([server()]), "cursor", "box", { username: "root" });
    expect(msg).toBe("Deployed 1 servers to box:/root/.cursor/mcp.json");
    expect(JSON.parse(remote.files.get("/root/.cursor/mcp.json")!).mcpServers.s1.command).toBe("node");
    expect(remote.commands[1]).toMatch(/^umask 077 && mkdir -p '\/root\/.cursor' && cat > /);
    expect(remote.commands[1]).toContain(`chmod "$(stat -c %a '/root/.cursor/mcp.json' 2>/dev/null || stat -f %Lp '/root/.cursor/mcp.json')"`);
  });

  it("defaults the user from $USER, then root", async () => {
    const user = process.env.USER;
    try {
      process.env.USER = "alice";
      await deployViaSSH(config([server()]), "cursor", "box");
      expect(remote.connectOpts).toMatchObject({ username: "alice" });
      delete process.env.USER;
      await deployViaSSH(config([server()]), "cursor", "box");
      expect(remote.connectOpts).toMatchObject({ username: "root" });
    } finally {
      process.env.USER = user;
    }
  });

  it("refuses to overwrite a remote file it can't parse", async () => {
    remote.files.set(path, "{ broken");
    await expect(deployViaSSH(hub, "cursor", "box", { username: "deploy" })).rejects.toThrow("isn't valid JSON");
    expect(remote.files.get(path)).toBe("{ broken");
    expect(remote.disposed).toBe(1);
  });

  it("reports a failed remote write", async () => {
    remote.failWrite = true;
    await expect(deployViaSSH(hub, "cursor", "box", { username: "deploy" })).rejects.toThrow("disk full");
    (remote as { failWrite: unknown }).failWrite = "silent";
    await expect(deployViaSSH(hub, "cursor", "box", { username: "deploy" })).rejects.toThrow("remote write failed (exit 1)");
  });

  it("closes the connection when connecting fails", async () => {
    remote.connectError = new Error("auth failed");
    await expect(deployViaSSH(hub, "cursor", "box")).rejects.toThrow("auth failed");
    expect(remote.disposed).toBe(1);
  });

  it("quotes paths with spaces or quotes", async () => {
    remote.failWrite = true; // only the commands matter here
    await deployViaSSH(config([server()]), "cursor", "box", { username: "o'neil" }).catch(() => {});
    expect(remote.commands[0]).toBe(`cat '/home/o'\\''neil/.cursor/mcp.json'`);
  });
});

describe("deployToK8s", () => {
  it("pipes a ConfigMap manifest to kubectl apply", async () => {
    const msg = await deployToK8s(hub, "cursor", { context: "prod", namespace: "ai", configMapName: "mcp" });
    const [call] = kube.calls;
    expect(call.cmd).toBe("kubectl");
    expect(call.args).toEqual(["--context", "prod", "apply", "-f", "-"]);
    const m = parse(call.input);
    expect(m).toMatchObject({ kind: "Secret", type: "Opaque", metadata: { name: "mcp", namespace: "ai" } });
    expect(m.data).toBeUndefined();
    const cfg = JSON.parse(m.stringData["mcp-config"]);
    expect(Object.keys(cfg.mcpServers)).toEqual(["plain", "secret"]);
    expect(cfg.mcpServers.secret.env.TOKEN).toBe("real-value");
    expect(msg).toBe("Deployed 2 servers to k8s Secret ai/mcp (skipped, missing in .env: missing): configmap/x configured");
  });

  it("uses default namespace and name", async () => {
    const msg = await deployToK8s(config([server()]), "cursor");
    expect(kube.calls[0].args).toEqual(["apply", "-f", "-"]);
    expect(msg).toBe("Deployed 1 servers to k8s Secret default/mcp-config: configmap/x configured");
  });

  it("reports kubectl errors", async () => {
    kube.code = 1;
    kube.stderr = "forbidden\n";
    await expect(deployToK8s(hub, "cursor")).rejects.toThrow("forbidden");
    kube.stderr = "";
    await expect(deployToK8s(hub, "cursor")).rejects.toThrow("kubectl exited with 1");
    kube.spawnError = new Error("spawn kubectl ENOENT");
    await expect(deployToK8s(hub, "cursor")).rejects.toThrow("ENOENT");
  });
});
