import { parse, stringify } from "yaml";
import { TargetAdapter, type SerializedServer } from "./base.js";
import { TARGET_CONFIGS } from "../config/defaults.js";

type Doc = Record<string, unknown>;

/**
 * Docker MCP config (YAML), servers under "mcpServers" (or legacy "servers").
 *
 * Docker Desktop's MCP Toolkit also keeps a ~/.docker/mcp/config.yaml, but that
 * one holds per-server settings, not a server list. Writing would overwrite it,
 * so a non-empty file without a server list is refused rather than changed.
 */
export class DockerAdapter extends TargetAdapter {
  constructor() {
    super(TARGET_CONFIGS["docker"]);
  }

  private parseDoc(raw: string): Doc {
    if (!raw.trim()) return {};
    let doc: unknown;
    try {
      doc = parse(raw);
    } catch {
      throw new Error(`${this.configPath} isn't valid YAML, so it wasn't changed`);
    }
    if (doc == null) return {};
    if (typeof doc !== "object" || Array.isArray(doc)) {
      throw new Error(`${this.configPath} isn't a YAML mapping, so it wasn't changed`);
    }
    return doc as Doc;
  }

  private key(doc: Doc): "mcpServers" | "servers" | null {
    if ("mcpServers" in doc) return "mcpServers";
    if ("servers" in doc) return "servers";
    return null;
  }

  deserialize(raw: string): Map<string, SerializedServer> {
    const doc = this.parseDoc(raw);
    const key = this.key(doc);
    return new Map(Object.entries((key && (doc[key] as Record<string, SerializedServer>)) || {}));
  }

  serialize(servers: Map<string, SerializedServer>, existingRaw: string): string {
    const doc = this.parseDoc(existingRaw);
    const key = this.key(doc);
    if (!key && Object.keys(doc).length > 0) {
      throw new Error(
        `${this.configPath} has no server list (it looks like Docker's own per-server settings), so it wasn't changed`
      );
    }
    return stringify({ ...doc, [key ?? "mcpServers"]: Object.fromEntries(servers) });
  }
}
