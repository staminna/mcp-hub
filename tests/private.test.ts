import { describe, it, expect, vi } from "vitest";
import { statSync, chmodSync, symlinkSync, lstatSync, readFileSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { writeFilePrivate } from "../src/fs/private.js";
import { saveEnvFile } from "../src/secrets/env-file.js";
import { createBackup } from "../src/sync/backup.js";
import { getAdapter } from "../src/targets/registry.js";
import { HUB_ENV_PATH } from "../src/config/defaults.js";
import { server, write, remove, hubDir, home } from "./helpers.js";

const mode = (p: string) => statSync(p).mode & 0o777;

describe("writeFilePrivate", () => {
  it("creates new files 0600 in new 0700 folders", async () => {
    const p = join(hubDir(), "priv", "deep", "f.json");
    await writeFilePrivate(p, "x");
    expect(mode(p)).toBe(0o600);
    expect(mode(join(hubDir(), "priv", "deep"))).toBe(0o700);
    expect(readFileSync(p, "utf-8")).toBe("x");
  });

  it("keeps an existing file's mode (doesn't widen 600 or narrow 644)", async () => {
    const a = join(hubDir(), "a.json");
    const b = join(hubDir(), "b.json");
    write(a, "1"); chmodSync(a, 0o600);
    write(b, "1"); chmodSync(b, 0o644);
    await writeFilePrivate(a, "2");
    await writeFilePrivate(b, "2");
    expect([mode(a), mode(b)]).toEqual([0o600, 0o644]);
  });

  it("writes through a symlink and leaves no tmp files", async () => {
    const real = join(hubDir(), "real.json");
    const link = join(hubDir(), "link.json");
    write(real, "old"); chmodSync(real, 0o640);
    symlinkSync(real, link);
    await writeFilePrivate(link, "new");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(real, "utf-8")).toBe("new");
    expect(mode(real)).toBe(0o640);
    expect(readdirSync(hubDir()).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("cleans up its tmp file when the rename fails", async () => {
    const dir = join(hubDir(), "is-a-dir");
    mkdirSync(join(dir, "inner"), { recursive: true });
    await expect(writeFilePrivate(dir, "x")).rejects.toThrow();
    expect(readdirSync(hubDir()).filter((f) => f.startsWith("is-a-dir.") && f.endsWith(".tmp"))).toEqual([]);
  });
});

describe("files that hold tokens are private", () => {
  it("a new .env is 0600", async () => {
    remove(HUB_ENV_PATH);
    await saveEnvFile({ T: "secret" });
    expect(mode(HUB_ENV_PATH)).toBe(0o600);
  });

  it("a new editor config is 0600; an existing one keeps its mode", async () => {
    const cursor = getAdapter("cursor");
    remove(join(home(), ".cursor"));
    await cursor.merge([server()]);
    expect(mode(cursor.configPath)).toBe(0o600);
    chmodSync(cursor.configPath, 0o644);
    await cursor.merge([server({ id: "two" })]);
    expect(mode(cursor.configPath)).toBe(0o644);
  });

  it("backups are 0600 and their folders 0700, tightening existing folders", async () => {
    const backups = join(home(), "bk");
    mkdirSync(join(backups, "cursor"), { recursive: true });
    chmodSync(backups, 0o755);
    chmodSync(join(backups, "cursor"), 0o755);
    const src = join(home(), "src.json");
    write(src, "{}"); chmodSync(src, 0o644);
    const b = (await createBackup("cursor", src, backups))!;
    expect(mode(b)).toBe(0o600);
    expect([mode(backups), mode(join(backups, "cursor"))]).toEqual([0o700, 0o700]);
  });
});

describe("serve binds to this machine only", () => {
  it("listens on 127.0.0.1 by default, on --host when given (with a warning)", async () => {
    const { serveCommand } = await import("../src/cli/commands/serve.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const s1 = await serveCommand({ port: 0 });
      expect((s1.address() as { address: string }).address).toBe("127.0.0.1");
      s1.close();
      const s2 = await serveCommand({ port: 0, host: "0.0.0.0" });
      expect((s2.address() as { address: string }).address).toBe("0.0.0.0");
      s2.close();
      expect(log.mock.calls.flat().join("\n")).toMatch(/Listening on 0.0.0.0: anyone who can reach it/);
      const s3 = await serveCommand({ port: 0, host: "localhost" });
      s3.close();
    } finally {
      log.mockRestore();
    }
  });
});
