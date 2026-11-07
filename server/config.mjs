import { resolve } from "node:path";
import { z } from "zod";

const flag = z.enum(["true", "false"]).transform((value) => value === "true");
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_PATH: z.string().min(1).optional(),
  DEMO_MODE: flag.optional(),
  COOKIE_SECURE: flag.optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  PUBLIC_ORIGIN: z.url().optional(),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
});

export function readConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Never include supplied values: the environment may contain credentials.
    throw new Error(`Invalid runtime configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  const settings = parsed.data;
  const production = settings.NODE_ENV === "production";
  if (production && !settings.DATABASE_PATH)
    throw new Error("Production requires DATABASE_PATH on a persistent volume.");
  const publicUrl = settings.PUBLIC_ORIGIN ? new URL(settings.PUBLIC_ORIGIN) : null;
  if (publicUrl && (!/^https?:$/.test(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash))
    throw new Error("PUBLIC_ORIGIN must be an HTTP(S) origin without credentials or a path.");
  const secureCookie = settings.COOKIE_SECURE ?? production;
  const demo = settings.DEMO_MODE ?? !production;
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(settings.HOST);
  if (publicUrl?.protocol === "https:" && !secureCookie)
    throw new Error("HTTPS deployments require COOKIE_SECURE=true.");
  if (production && settings.DATABASE_PATH === ":memory:")
    throw new Error("Production requires a persistent database, not :memory:.");
  if (production && !demo && !loopback && (publicUrl?.protocol !== "https:" || !secureCookie))
    throw new Error("Network-facing production requires an HTTPS PUBLIC_ORIGIN and COOKIE_SECURE=true. Bind HOST=127.0.0.1 for local HTTP testing.");
  return Object.freeze({
    production,
    host: settings.HOST,
    port: settings.PORT,
    databasePath: settings.DATABASE_PATH ?? "./data/market.sqlite",
    demo,
    secureCookie,
    trustProxy: settings.TRUST_PROXY,
    publicOrigin: publicUrl?.origin,
    staticDir: resolve("dist"),
    shutdownTimeoutMs: settings.SHUTDOWN_TIMEOUT_MS,
  });
}
