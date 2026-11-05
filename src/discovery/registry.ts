import { type DiscoveryResult } from "../types.js";

export const POPULAR_SERVERS: DiscoveryResult[] = [
  {
    name: "@modelcontextprotocol/server-filesystem",
    source: "registry",
    description: "File system access for reading/writing files",
    command: "npx",
    installCommand: "npx -y @modelcontextprotocol/server-filesystem",
  },
  {
    name: "@modelcontextprotocol/server-github",
    source: "registry",
    description: "GitHub API integration",
    command: "npx",
    installCommand: "npx -y @modelcontextprotocol/server-github",
  },
  {
    name: "@modelcontextprotocol/server-postgres",
    source: "registry",
    description: "PostgreSQL database access",
    command: "npx",
    installCommand: "npx -y @modelcontextprotocol/server-postgres",
  },
  {
    name: "@modelcontextprotocol/server-slack",
    source: "registry",
    description: "Slack workspace integration",
    command: "npx",
    installCommand: "npx -y @modelcontextprotocol/server-slack",
  },
  {
    name: "@anthropics/claude-code-mcp",
    source: "registry",
    description: "Claude Code as an MCP server",
    command: "npx",
    installCommand: "npx -y @anthropics/claude-code-mcp",
  },
  {
    name: "directus-mcp-server",
    source: "registry",
    description: "Directus CMS MCP server",
    command: "npx",
    installCommand: "npx -y directus-mcp-server",
  },
];

export function searchRegistry(query?: string): DiscoveryResult[] {
  if (!query) return POPULAR_SERVERS;
  const lower = query.toLowerCase();
  return POPULAR_SERVERS.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.description?.toLowerCase().includes(lower)
  );
}
