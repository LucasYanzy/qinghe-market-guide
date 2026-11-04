import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/app.mjs";
import { openDatabase } from "../../server/db.mjs";

const directory = mkdtempSync(join(tmpdir(), "qinghe-ui-"));
const db = openDatabase(join(directory, "market.sqlite"));
// Isolated browser sessions share one loopback IP during this regression suite.
const server = createApp(db, { staticDir: process.env.UI_STATIC_DIR, authAttemptLimit: 1000 }).listen(Number(process.env.PLAYWRIGHT_PORT ?? 3101), "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
      process.exit(0);
    });
  });
}
