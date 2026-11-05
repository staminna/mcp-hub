import { type DiscoveryResult } from "../types.js";

export async function searchNpm(query = "mcp-server"): Promise<DiscoveryResult[]> {
  try {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = (await response.json()) as {
      objects: Array<{
        package: { name: string; description?: string };
      }>;
    };

    return data.objects.map((obj) => ({
      name: obj.package.name,
      source: "npm" as const,
      description: obj.package.description,
      command: "npx",
      installCommand: `npm install -g ${obj.package.name}`,
    }));
  } catch {
    return [];
  }
}
