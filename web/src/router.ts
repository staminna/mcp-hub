import { useEffect, useState } from "react";

export type Route =
  | { view: "dashboard" }
  | { view: "server"; id: string }
  | { view: "add" }
  | { view: "targets" }
  | { view: "diff" }
  | { view: "import" }
  | { view: "discover" }
  | { view: "skills" }
  | { view: "memories" }
  | { view: "secrets" }
  | { view: "404" };

export function matchRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/") return { view: "dashboard" };
  const server = path.match(/^\/server\/(.+)$/);
  if (server) return { view: "server", id: decodeURIComponent(server[1]) };
  const simple = ["add", "targets", "diff", "import", "discover", "skills", "memories", "secrets"] as const;
  const hit = simple.find((v) => path === `/${v}`);
  return hit ? { view: hit } : { view: "404" };
}

export function useRoute(): Route {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return matchRoute(hash);
}

export function navigate(to: string): void {
  window.location.hash = to;
}
