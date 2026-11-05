import { type Request, type Response, type NextFunction, type RequestHandler } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** "host:port" or "[::1]:port" → host name. */
function hostName(hostHeader: string): string {
  const m = hostHeader.match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/);
  return (m ? m[1] : hostHeader).toLowerCase();
}

/**
 * The dashboard can read and write real tokens, so only this machine may use it.
 *
 * - Host must be localhost (or the --host you chose): blocks DNS rebinding,
 *   where a website points its own domain at 127.0.0.1 to read responses.
 * - Writes (POST/PUT/DELETE) must not come from another site: blocks a page
 *   you visit from firing requests at the dashboard. Same-origin pages, the
 *   Vite dev proxy and tools that send no Origin (curl, the CLI) pass.
 */
export function localOnly(extraHosts: string[] = []): RequestHandler {
  const allowed = new Set([...LOCAL_HOSTS, ...extraHosts.map((h) => h.toLowerCase())]);
  return (req: Request, res: Response, next: NextFunction) => {
    const host = hostName(req.headers.host ?? "");
    if (!allowed.has(host)) {
      return res.status(403).json({ error: `Host "${host}" isn't allowed; open the dashboard via localhost` });
    }
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      const origin = req.headers.origin;
      const site = req.headers["sec-fetch-site"];
      let originHost: string | null = null;
      if (origin) {
        try {
          originHost = hostName(new URL(origin).host);
        } catch {
          originHost = "invalid";
        }
      }
      if (site === "cross-site" || (originHost !== null && !allowed.has(originHost))) {
        return res.status(403).json({ error: "Cross-site requests can't change the hub" });
      }
    }
    next();
  };
}
