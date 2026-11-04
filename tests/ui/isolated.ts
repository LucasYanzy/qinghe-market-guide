import { test as base } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/app.mjs";
import { openDatabase } from "../../server/db.mjs";

// Account-switch and checkout cases need independent sessions, stock and login limits.
export const test = base.extend({
  // Existing workflow cases explicitly exercise Chinese; language preference survives reloads.
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      try {
        if (localStorage.getItem("qinghe-language") === null) localStorage.setItem("qinghe-language", "zh");
      } catch { /* Storage-blocked cases exercise the English default. */ }
    });
    await use(context);
  },
  baseURL: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), "qinghe-shopping-"));
    const db = openDatabase(join(directory, "market.sqlite"));
    const server = createApp(db).listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test server port");
      await use(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
});
