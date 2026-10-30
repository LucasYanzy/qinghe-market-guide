import { openDatabase } from "./db.mjs";
import { createApp } from "./app.mjs";
import { readConfig } from "./config.mjs";

const config = readConfig();
const db = openDatabase(config.databasePath, { demo: config.demo });
if (!config.demo && db.prepare("SELECT 1 FROM users WHERE email LIKE '%@qinghe.demo' LIMIT 1").get()) {
  db.close();
  throw new Error("This database contains demo accounts. Use a new DATABASE_PATH for production.");
}
const app = createApp(db, config);
const server = app.listen(
  config.port,
  config.host,
  () => {
    console.log(
      `Qinghe listening on port ${server.address().port} (${config.demo ? "DEMO data" : "production data"}).`,
    );
  },
);
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.on("error", (error) => {
  console.error(`HTTP server failed: ${error.code ?? "unknown"}`);
  db.close();
  process.exitCode = 1;
});
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log(`${signal}: draining HTTP requests.`);
    const deadline = setTimeout(() => {
      server.closeAllConnections();
    }, config.shutdownTimeoutMs);
    deadline.unref();
    server.close(() => {
      clearTimeout(deadline);
      db.close();
      process.exitCode = 0;
    });
    server.closeIdleConnections();
  });
}
