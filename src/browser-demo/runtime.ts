// These are the same route definitions and transactional services as the Node app.
// Vite aliases only their platform boundaries for this standalone demo build.
// @ts-expect-error JavaScript server modules intentionally share the browser boundary.
import { createApp } from "../../server/app.mjs";
// @ts-expect-error JavaScript database schema and seed are shared with Node.
import { openDatabase } from "../../server/db.mjs";
import { initializeSqlite, persistDemo } from "./sqlite";
import type { Role, User } from "../types";

let currentRole: Role = "client";
let currentUserId = 0;
const roleKey = "qinghe-demo-role";
const userKey = "qinghe-demo-user";
export function demoRole() { return currentRole; }
export async function initializeDemo() {
  await initializeSqlite();
  const db = openDatabase(":memory:");
  try {
    const saved = sessionStorage.getItem(roleKey);
    if (saved === "retailer" || saved === "admin") currentRole = saved;
    currentUserId = Number(sessionStorage.getItem(userKey)) || 0;
  } catch { /* The default customer role works without browser storage. */ }
  const localPath = location.pathname.slice(import.meta.env.BASE_URL.replace(/\/$/, "").length);
  if (localPath.startsWith("/admin")) { currentRole = "admin"; currentUserId = 0; }
  if (localPath.startsWith("/retailer") && currentRole !== "retailer") { currentRole = "retailer"; currentUserId = 0; }
  const userFor = (role: Role, id = currentUserId): User => {
    const user = (id ? db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(id) : undefined)
      ?? db.prepare("SELECT id,name,email,role FROM users WHERE email=?").get(`${role}@qinghe.demo`);
    const roles: Role[] = [...new Set<Role>([user.role, ...db.prepare("SELECT role FROM user_roles WHERE user_id=?").all(user.id).map((entry: { role: Role }) => entry.role)])];
    return { ...user, role, roles };
  };
  const saveIdentity = () => {
    currentUserId = userFor(currentRole).id;
    try { sessionStorage.setItem(roleKey, currentRole); sessionStorage.setItem(userKey, String(currentUserId)); } catch { /* Role switches still work in memory. */ }
  };
  saveIdentity();
  const app = createApp(db);
  const originalFetch = window.fetch.bind(window);
  let queue = Promise.resolve();
  window.fetch = async (input, options) => {
    const request = new Request(typeof input === "string" ? new URL(input, location.href) : input, options);
    const url = new URL(request.url);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return originalFetch(input, options);
    // A single queue preserves the same transaction ordering as one Node process.
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
      let body;
      try { body = text ? JSON.parse(text) : {}; }
      catch { return Response.json({ error: "请求内容必须为有效 JSON。" }, { status: 400 }); }
      if (url.pathname === "/api/demo/role" && request.method === "POST") {
        if (!["client", "retailer", "admin"].includes(body.role)) return Response.json({ error: "Invalid demo role" }, { status: 400 });
        currentRole = body.role;
        currentUserId = 0;
        saveIdentity();
        return Response.json({ user: userFor(currentRole) });
      }
      // No credentials or authentication are accepted by this browser-only target.
      if (url.pathname === "/api/auth/me") return Response.json({ user: userFor(currentRole) });
      if (url.pathname === "/api/auth/role" && request.method === "POST") {
        if (!userFor(currentRole).roles?.includes(body.role)) return Response.json({ error: "当前账号无权进行此操作。" }, { status: 403 });
        currentRole = body.role;
        saveIdentity();
        return Response.json({ user: userFor(currentRole) });
      }
      if (url.pathname.startsWith("/api/auth/")) return Response.json({ error: "Use the demo role selector." }, { status: 400 });
      const headers = Object.fromEntries(request.headers);
      const req = { method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
        params: {}, body, headers, user: userFor(currentRole), ip: "browser-demo", protocol: location.protocol.slice(0, -1),
        get(name: string) { return name.toLowerCase() === "host" ? location.host : headers[name.toLowerCase()]; } };
      let status = 200;
      let response: Response | undefined;
      const res = {
        finished: false,
        status(value: number) { status = value; return this; },
        set(_name: unknown, _value?: unknown) { return this; },
        cookie() { return this; }, clearCookie() { return this; },
        json(value: unknown) { this.finished = true; response = Response.json(value, { status }); return this; },
      };
      await app.dispatch(req, res, (error?: Error) => {
        if (error) throw error;
        res.status(404).json({ error: "接口不存在。" });
      });
      if (!["GET", "HEAD"].includes(request.method)) persistDemo();
      return response ?? Response.json({ error: "接口不存在。" }, { status: 404 });
    } finally { release(); }
  };
  persistDemo();
}
