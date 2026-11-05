import chalk from "chalk";
import { type Server } from "http";
import { createServer } from "../../server/index.js";

/**
 * Start the dashboard. It listens on 127.0.0.1 only, unless you pass a host:
 * it can read and write real tokens, so it shouldn't be reachable from your network.
 */
export function serveCommand({ port, host = "127.0.0.1" }: { port: number; host?: string }): Promise<Server> {
  const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  const app = createServer({ hosts: local ? [] : [host] });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(chalk.green(`  MCP Hub dashboard running at http://localhost:${port}`));
      if (!local) {
        console.log(chalk.yellow(`  ! Listening on ${host}: anyone who can reach it can read and change your tokens.`));
      }
      console.log(chalk.dim("  Press Ctrl+C to stop"));
      resolve(server);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(chalk.red(`  Port ${port} is already in use. Is the hub already running? Try --port <other>.`));
        process.exitCode = 1;
      }
      reject(err);
    });
  });
}
