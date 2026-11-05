import chalk from "chalk";
import { type Server } from "http";
import { createServer } from "../../server/index.js";

export function serveCommand({ port }: { port: number }): Promise<Server> {
  const app = createServer();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(chalk.green(`  MCP Hub dashboard running at http://localhost:${port}`));
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
