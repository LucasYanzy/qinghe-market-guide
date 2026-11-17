import { z } from "zod";
import {
  datasetSchema,
  sessionSchema,
  inventorySchema,
  quoteSchema,
  type RecordKind,
  type MarketRecord,
  mergeRecords,
  recordKey,
  type Dataset,
} from "../shared/domain.ts";

export const recordsStorageKey = "qinghe-market-guide:operations:records:v1";
const stateSchema = datasetSchema.extend({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type BrowserState = Dataset & { revision: number };
type RecordStorage = Pick<Storage, "getItem" | "setItem">;

export function readBrowserRecords(storage: RecordStorage): BrowserState {
  const value = storage.getItem(recordsStorageKey);
  if (value === null)
    return { sessions: [], inventory: [], quotes: [], revision: 0 };
  try {
    return stateSchema.parse(JSON.parse(value));
  } catch {
    throw new Error(
      "The saved browser records could not be read. They have been kept unchanged; restore from a JSON backup in a fresh browser profile.",
    );
  }
}

export function writeBrowserRecords(
  storage: RecordStorage,
  action: string,
  payload: any,
  revision: number,
) {
  const current = readBrowserRecords(storage);
  if (revision !== current.revision)
    throw new Error("Records changed in another tab. Refresh before saving.");
  let data: Dataset = {
    sessions: [...current.sessions],
    inventory: [...current.inventory],
    quotes: [...current.quotes],
  };
  let stats: { added: number; skipped: number } | undefined;
  if (action === "import") {
    const merged = mergeRecords(data, datasetSchema.parse(payload.data));
    data = merged.data;
    stats = { added: merged.added, skipped: merged.skipped };
  } else {
    const save = /^records\/(sessions|inventory|quotes)$/.exec(action);
    const remove = /^delete\/(sessions|inventory|quotes)\/(.+)$/.exec(action);
    if (save) {
      const kind = save[1] as RecordKind;
      const row = (
        kind === "sessions"
          ? sessionSchema
          : kind === "inventory"
            ? inventorySchema
            : quoteSchema
      ).parse(payload.record);
      const list = data[kind] as MarketRecord[];
      if (list.some((r) => r.id !== row.id && recordKey(r) === recordKey(row)))
        throw new Error(
          "A record with the same identifying fields already exists",
        );
      const index = list.findIndex((r) => r.id === row.id);
      if (index < 0) list.push(row);
      else list[index] = row;
    } else if (remove) {
      const kind = remove[1] as RecordKind;
      const id = decodeURIComponent(remove[2]);
      if (!data[kind].some((r) => r.id === id))
        throw new Error("Record no longer exists");
      (data as any)[kind] = data[kind].filter((r) => r.id !== id);
    } else throw new Error("Unknown record action");
  }
  const next = stateSchema.parse({ ...data, revision: current.revision + 1 });
  // Serialize and validate the full batch before the single persistent write.
  storage.setItem(recordsStorageKey, JSON.stringify(next));
  return { ...next, ...stats };
}

export async function saveBrowserRecords(
  action: string,
  payload: any,
  revision: number,
) {
  if (!navigator.locks)
    throw new Error(
      "Use a current browser with Web Locks support to save records safely across tabs.",
    );
  return navigator.locks.request(recordsStorageKey, () =>
    writeBrowserRecords(localStorage, action, payload, revision),
  );
}
