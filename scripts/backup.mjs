import { backup, DatabaseSync } from "node:sqlite";
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databasePath = process.env.DATABASE_PATH;
const destination = process.argv[2];
if (!databasePath || !destination) {
  console.error("Usage: DATABASE_PATH=/data/market.sqlite npm run backup -- /backups/market-YYYY-MM-DD.sqlite");
  process.exitCode = 1;
} else {
  let db;
  try {
    if (resolve(databasePath) === resolve(destination)) throw new Error("Backup must use a different path.");
    await stat(databasePath);
    try { await stat(destination); throw new Error("Backup destination already exists; choose a new filename."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await mkdir(dirname(destination), { recursive: true });
    db = new DatabaseSync(databasePath, { readOnly: true });
    await backup(db, destination);
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      if (copy.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Backup integrity check failed.");
      if (copy.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Backup contains invalid foreign keys.");
    } finally { copy.close(); }
    console.log(`Verified SQLite backup: ${resolve(destination)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { db?.close(); }
}
