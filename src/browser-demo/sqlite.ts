import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

import { demoStorageKey as storageKey, reportStorage } from "./state";
let SQL: SqlJsStatic;
let current: DatabaseSync;
let restored: Uint8Array | undefined;


export async function initializeSqlite() {
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) restored = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
  } catch { reportStorage(false); }
}

// Match the synchronous database boundary used by the real business services.
// Statements are freed after every call so transactions and exports cannot leak handles.
export class DatabaseSync {
  database: Database;
  isTransaction = false;
  constructor(_path: string) {
    try { this.database = new SQL.Database(restored); }
    catch { this.database = new SQL.Database(); }
    current = this;
  }
  exec(sql: string) {
    this.database.exec(sql);
    if (/\bBEGIN\b/i.test(sql)) this.isTransaction = true;
    if (/\b(COMMIT|ROLLBACK)\b/i.test(sql)) this.isTransaction = false;
  }
  prepare(sql: string) {
    const rows = (...parameters: any[]) => {
      const statement = this.database.prepare(sql);
      try {
        statement.bind(parameters);
        const result = [];
        while (statement.step()) result.push(statement.getAsObject());
        return result;
      } finally { statement.free(); }
    };
    return {
      all: rows,
      get: (...parameters: any[]) => rows(...parameters)[0],
      run: (...parameters: any[]) => {
        this.database.run(sql, parameters);
        return { changes: this.database.getRowsModified(), lastInsertRowid: this.database.exec("SELECT last_insert_rowid() AS id")[0]?.values[0][0] ?? 0 };
      },
    };
  }
  close() { this.database.close(); }
}

export function persistDemo() {
  try {
    const bytes = current.database.export();
    current.database.exec("PRAGMA foreign_keys = ON");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    sessionStorage.setItem(storageKey, btoa(binary));
    reportStorage(true);
  } catch { reportStorage(false); }

}
