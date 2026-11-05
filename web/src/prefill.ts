import type { McpServer } from "./api.ts";

/** Hand a half-filled server from Discover to the Add form. */
let pending: Partial<McpServer> | null = null;
export const setPrefill = (s: Partial<McpServer>) => { pending = s; };
export const takePrefill = () => { const p = pending; pending = null; return p; };
