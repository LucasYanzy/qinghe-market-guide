import { openDatabase } from "./db.mjs";
import { createApp } from "./app.mjs";

const demo = process.env.DEMO_MODE !== "false";
const db = openDatabase(process.env.DATABASE_PATH ?? "./data/market.sqlite", {
  demo,
});
const app = createApp(db, {
  demo,
  secureCookie: process.env.COOKIE_SECURE === "true",
});
const server = app.listen(
  Number(process.env.PORT ?? 3001),
  process.env.HOST ?? "0.0.0.0",
  () => {
    console.log(
      `Qinghe API listening on port ${server.address().port} (${demo ? "DEMO data" : "production data"}).`,
    );
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
