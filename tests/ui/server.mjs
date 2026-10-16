import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/app.mjs";
import { openDatabase } from "../../server/db.mjs";

const directory = mkdtempSync(join(tmpdir(), "qinghe-ui-"));
const db = openDatabase(join(directory, "market.sqlite"));
const server = createApp(db).listen(3101, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
      process.exit(0);
    });
  });
}
