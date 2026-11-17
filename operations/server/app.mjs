import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  datasetSchema,
  sessionSchema,
  inventorySchema,
  quoteSchema,
  recordKey,
  mergeRecords,
} from "../shared/domain.ts";
export function createApp(databasePath) {
  if (databasePath !== ":memory:")
    mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,revision INTEGER NOT NULL); INSERT OR IGNORE INTO state VALUES(1,0,'{"sessions":[],"inventory":[]}');`,
  );
  const read = () => {
    const row = db.prepare("SELECT * FROM state WHERE id=1").get();
    return {
      ...datasetSchema.parse(JSON.parse(row.body)),
      revision: row.revision,
    };
  };
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "12mb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.get("origin");
      const allowed = new Set([
        `http://${req.get("host")}`,
        `https://${req.get("host")}`,
        "http://127.0.0.1:5186",
        "http://localhost:5186",
      ]);
      if (origin && !allowed.has(origin))
        return res.status(403).json({
          error: "This request must come from the market operations app",
        });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "Send JSON data" });
    }
    next();
  });
  app.get("/api/state", (_req, res) => res.json(read()));
  function write(req, res, action, fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = read();
      if (
        !Number.isInteger(req.body.revision) ||
        req.body.revision !== current.revision
      ) {
        db.exec("ROLLBACK");
        return res.status(409).json({
          error: "Records changed in another tab. Refresh before saving.",
        });
      }
      const { revision, ...data } = current;
      const result = fn(data);
      datasetSchema.parse(result.data);
      const nextRevision = revision + 1;
      db.prepare("UPDATE state SET revision=?,body=? WHERE id=1").run(
        nextRevision,
        JSON.stringify(result.data),
      );
      db.prepare("INSERT INTO audit(at,action,revision) VALUES(?,?,?)").run(
        new Date().toISOString(),
        action,
        nextRevision,
      );
      db.exec("COMMIT");
      res.json({
        ...result.data,
        revision: nextRevision,
        ...(result.stats ?? {}),
      });
    } catch (e) {
      db.exec("ROLLBACK");
      res.status(400).json({
        error:
          e.issues
            ?.map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ") ?? e.message,
      });
    }
  }
  app.post("/api/records/:kind", (req, res) => {
    const kind = req.params.kind;
    if (!["sessions", "inventory", "quotes"].includes(kind))
      return res.status(404).json({ error: "Unknown record type" });
    write(req, res, `save ${kind}`, (data) => {
      const record = (
        kind === "sessions"
          ? sessionSchema
          : kind === "inventory"
            ? inventorySchema
            : quoteSchema
      ).parse(req.body.record);
      const existing = data[kind].findIndex((x) => x.id === record.id);
      if (
        data[kind].some(
          (x) => x.id !== record.id && recordKey(x) === recordKey(record),
        )
      )
        throw new Error(
          "A record with the same identifying fields already exists",
        );
      const rows = [...data[kind]];
      if (existing >= 0) rows[existing] = record;
      else rows.push(record);
      return { data: { ...data, [kind]: rows } };
    });
  });
  app.post("/api/import", (req, res) =>
    write(req, res, "import records", (data) => {
      const incoming = datasetSchema.parse(req.body.data);
      const result = mergeRecords(data, incoming);
      return {
        data: result.data,
        stats: { added: result.added, skipped: result.skipped },
      };
    }),
  );
  app.post("/api/delete/:kind/:id", (req, res) => {
    const kind = req.params.kind;
    if (!["sessions", "inventory", "quotes"].includes(kind))
      return res.status(404).json({ error: "Unknown record type" });
    write(req, res, `delete ${kind}`, (data) => {
      if (!data[kind].some((x) => x.id === req.params.id))
        throw new Error("Record no longer exists");
      return {
        data: {
          ...data,
          [kind]: data[kind].filter((x) => x.id !== req.params.id),
        },
      };
    });
  });
  app.use((err, _req, res, _next) =>
    res.status(err.status ?? 500).json({
      error:
        err.type === "entity.too.large"
          ? "File is too large (12 MB maximum)"
          : err instanceof SyntaxError
            ? "Invalid JSON"
            : "Unable to process this request",
    }),
  );
  return { app, db };
}
