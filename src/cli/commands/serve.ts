import chalk from "chalk";
import { createServer } from "../../server/index.js";

export async function serveCommand(options: {
  port?: number;
}): Promise<void> {
  const port = options.port ?? 3847;
  const app = createServer();

  app.listen(port, () => {
    console.log(chalk.green(`  MCP Hub dashboard running at http://localhost:${port}`));
    console.log(chalk.dim("  Press Ctrl+C to stop"));
  });
}
