import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { loadEnvFile, saveEnvFile } from "../src/secrets/env-file.js";
import { resolveServer, detectSecrets, extractSecrets } from "../src/secrets/manager.js";
import { HUB_ENV_PATH } from "../src/config/defaults.js";
import { server, config, write, read, remove, hubDir } from "./helpers.js";

describe("env file", () => {
  beforeEach(() => remove(HUB_ENV_PATH));

  it("returns {} when there is no .env", async () => {
    expect(await loadEnvFile()).toEqual({});
  });

  it("parses keys, quotes, comments, blanks and junk lines", async () => {
    write(HUB_ENV_PATH, `# comment\n\nA=1\nB = "two words"\nC='single'\nnot a pair\nD=x=y\nE="unbalanced\n`);
    expect(await loadEnvFile()).toEqual({ A: "1", B: "two words", C: "single", D: "x=y", E: '"unbalanced' });
  });

  it("saves new keys, updates existing ones in place, keeps comments, drops removed keys", async () => {
    write(HUB_ENV_PATH, "# tokens\nA=old\nGONE=x\nnot a pair\n");
    await saveEnvFile({ A: "new", B: "added" });
    expect(read(HUB_ENV_PATH)).toBe("# tokens\nA=new\nnot a pair\nB=added\n");
    await saveEnvFile({ A: "new", B: "added" });
    expect(read(HUB_ENV_PATH)).toBe("# tokens\nA=new\nnot a pair\nB=added\n"); // no blank line creeping in
  });

  it("writes a fresh file at a given path", async () => {
    const p = join(hubDir(), "other.env");
    await saveEnvFile({ X: "1" }, p);
    expect(await loadEnvFile(p)).toEqual({ X: "1" });
  });
});

describe("resolveServer", () => {
  afterEach(() => { delete process.env.FROM_PROCESS; });

  it("fills ${VAR} in env and args from .env, then process.env", () => {
    process.env.FROM_PROCESS = "p";
    const { server: s, missing } = resolveServer(
      server({ env: { T: "${TOKEN}", P: "${FROM_PROCESS}", L: "literal" }, args: ["--key=${TOKEN}"] }),
      { TOKEN: "secret" },
    );
    expect(missing).toEqual([]);
    expect(s.env).toEqual({ T: "secret", P: "p", L: "literal" });
    expect(s.args).toEqual(["--key=secret"]);
  });

  it("reports each missing or empty var once and leaves the reference", () => {
    const { server: s, missing } = resolveServer(server({ env: { A: "${NOPE}", B: "${NOPE}", C: "${EMPTY}" } }), { EMPTY: "" });
    expect(missing).toEqual(["NOPE", "EMPTY"]);
    expect(s.env!.A).toBe("${NOPE}");
  });

  it("handles servers with no env or args", () => {
    const { server: s, missing } = resolveServer(server({ args: undefined }), {});
    expect(missing).toEqual([]);
    expect(s.env).toBeUndefined();
    expect(s.args).toBeUndefined();
  });

  it("doesn't change the original server", () => {
    const original = server({ env: { A: "${X}" } });
    resolveServer(original, { X: "1" });
    expect(original.env!.A).toBe("${X}");
  });
});

describe("detectSecrets", () => {
  it("finds token-like keys and long opaque values", () => {
    const found = detectSecrets(server({
      env: {
        GITHUB_TOKEN: "ghp_abcdefgh",
        RANDOM: "A".repeat(25),
        REF: "${ALREADY}",
        PATH_VAR: "/Users/me/.kube/config",
        URL: "https://api.example.com",
        FLAG: "true",
        NAME: "some readable words here",
      },
    }));
    expect(found.map((f) => f.key)).toEqual(["GITHUB_TOKEN", "RANDOM"]);
  });

  it("is stable across calls (no stateful regex)", () => {
    const s = server({ env: { A: "${X}", API_KEY: "abcdefghij" } });
    expect(detectSecrets(s)).toEqual(detectSecrets(s));
  });

  it("returns nothing for servers without env", () => {
    expect(detectSecrets(server())).toEqual([]);
  });
});

describe("extractSecrets", () => {
  it("moves secrets to vars named after the server and leaves references", () => {
    const { config: out, extracted } = extractSecrets(config([
      server({ id: "my-db", env: { DB_PASSWORD: "hunter2hunter2", MODE: "dev" } }),
      server({ id: "plain", env: { MODE: "x" } }),
      server({ id: "none" }),
    ]));
    expect(extracted).toEqual({ MY_DB_DB_PASSWORD: "hunter2hunter2" });
    expect(out.servers[0].env).toEqual({ DB_PASSWORD: "${MY_DB_DB_PASSWORD}", MODE: "dev" });
    expect(out.servers[1].env).toEqual({ MODE: "x" });
    expect(out.servers[2].env).toBeUndefined();
  });
});
