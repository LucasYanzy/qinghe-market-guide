import express from "express";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { marketDay, hashPassword } from "./db.mjs";
import { forecastPrices } from "./forecast.mjs";
import {
  getOrders,
  placeOrder,
  updateOrderStatus,
  HttpError,
  pickupSlots,
} from "./services.mjs";

const productSchema = z.object({
  name: z.string().trim().min(1).max(50),
  category: z.enum(["叶菜类", "根茎类", "果实类"]),
  art: z.enum([
    "tomato",
    "broccoli",
    "carrot",
    "lettuce",
    "pumpkin",
    "cucumber",
    "potato",
    "onion",
  ]),
  unit: z.enum(["磅", "颗", "把", "个", "袋"]),
  price_cents: z.number().int().min(1).max(100000),
  stock: z.number().int().min(0).max(10000),
  description: z.string().trim().max(500),
  organic: z.boolean(),
  available_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const date = new Date(`${v}T00:00:00Z`);
      return (
        !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v
      );
    }),
  active: z.boolean(),
});
const digest = (token) => createHash("sha256").update(token).digest("hex");

export function createApp(
  db,
  { demo = true, secureCookie = false, staticDir = resolve("dist") } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-store",
    });
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      // Reject cross-origin browser writes; API never enables CORS.
      const origin = req.get("origin");
      if (
        req.get("sec-fetch-site") === "cross-site" ||
        (origin && new URL(origin).host !== req.get("host"))
      ) {
        return res.status(403).json({ error: "请从本站提交请求。" });
      }
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (req, res, next) => {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("qinghe_session="))
      ?.slice(15);
    if (cookie) {
      req.user = db
        .prepare(
          `SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=? AND s.expires_at>?`,
        )
        .get(digest(cookie), Date.now());
    }
    next();
  });
  const requireUser = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: "请先登录。" });
  const role = (expected) => (req, res, next) =>
    req.user?.role === expected
      ? next()
      : res.status(403).json({ error: "当前账号无权进行此操作。" });
  const publicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  const session = (res, user) => {
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      digest(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    res.cookie("qinghe_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookie,
      maxAge: 7 * 86400000,
      path: "/",
    });
    return publicUser(user);
  };
  const attempts = new Map();
  const throttle = (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    if (attempts.size > 1000)
      for (const [ip, entry] of attempts)
        if (entry.until < now) attempts.delete(ip);
    const entry = attempts.get(key);
    if (entry && entry.until > now && entry.count >= 20)
      return res
        .status(429)
        .json({ error: "尝试次数过多，请在 15 分钟后重试。" });
    attempts.set(key, {
      count: entry?.until > now ? entry.count + 1 : 1,
      until: entry?.until > now ? entry.until : now + 900000,
    });
    next();
  };
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", database: !!db.prepare("SELECT 1").get() }),
  );
  app.get("/api/config", (_req, res) =>
    res.json({
      demo,
      today: marketDay(),
      timezone: "America/New_York",
      currency: "USD",
      pickupSlots,
    }),
  );
  app.get("/api/auth/me", (req, res) => res.json({ user: req.user ?? null }));
  app.post("/api/auth/login", throttle, (req, res) => {
    const input = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(128),
      })
      .parse(req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(input.email);
    const [salt, hash] = (
      user?.password_hash ?? hashPassword("constant-time-dummy")
    ).split(":");
    const valid = timingSafeEqual(
      Buffer.from(hash, "hex"),
      scryptSync(input.password, salt, 64),
    );
    if (!user || !valid) throw new HttpError(401, "邮箱或密码不正确。");
    // Retire the previous cookie on account switches.
    const previous = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("qinghe_session="))
      ?.slice(15);
    if (previous)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        digest(previous),
      );
    res.json({ user: session(res, user) });
  });
  app.post("/api/auth/register", throttle, (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(40),
        email: z.email().max(254),
        password: z.string().min(10).max(128),
      })
      .parse(req.body);
    if (db.prepare("SELECT id FROM users WHERE email=?").get(input.email))
      throw new HttpError(409, "该邮箱已注册。");
    const result = db
      .prepare(
        "INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'client')",
      )
      .run(input.email, input.name, hashPassword(input.password));
    res
      .status(201)
      .json({
        user: session(res, {
          id: Number(result.lastInsertRowid),
          ...input,
          role: "client",
        }),
      });
  });
  app.post("/api/auth/logout", (req, res) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("qinghe_session="))
      ?.slice(15);
    if (token)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
    res
      .clearCookie("qinghe_session", {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: secureCookie,
      })
      .json({ ok: true });
  });
  app.get("/api/markets", (_req, res) =>
    res.json(db.prepare("SELECT * FROM markets").all()),
  );
  app.get("/api/products", (req, res) => {
    const category =
      typeof req.query.category === "string" ? req.query.category : "";
    const search =
      typeof req.query.search === "string" ? req.query.search.slice(0, 80) : "";
    res.json(
      db
        .prepare(
          `SELECT * FROM products WHERE active=1 AND available_date=?
      AND (?='' OR category=?) AND (?='' OR instr(name,?)>0 OR instr(farm,?)>0) ORDER BY id`,
        )
        .all(marketDay(), category, category, search, search, search),
    );
  });
  app.get("/api/products/:id/prices", (req, res) => {
    const product = db
      .prepare("SELECT * FROM products WHERE id=? AND active=1")
      .get(req.params.id);
    if (!product) throw new HttpError(404, "商品不存在。");
    const history = db
      .prepare(
        "SELECT date,price_cents FROM price_history WHERE product_id=? ORDER BY date",
      )
      .all(product.id);
    res.json({ product, history, forecast: forecastPrices(history) });
  });
  app.get("/api/orders", requireUser, (req, res) =>
    res.json(getOrders(db, req.user)),
  );
  app.post("/api/orders", requireUser, role("client"), (req, res) => {
    const input = z
      .object({
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().int().min(1).max(100),
            }),
          )
          .min(1)
          .max(50),
        pickupSlot: z.enum(pickupSlots),
        note: z.string().trim().max(300).default(""),
      })
      .parse(req.body);
    res.status(201).json(placeOrder(db, req.user, input));
  });
  app.patch("/api/orders/:id/status", requireUser, (req, res) => {
    const input = z
      .object({ status: z.enum(["confirmed", "completed", "cancelled"]) })
      .parse(req.body);
    res.json(updateOrderStatus(db, req.user, req.params.id, input.status));
  });
  app.get("/api/retailer/products", requireUser, role("retailer"), (req, res) =>
    res.json(
      db
        .prepare("SELECT * FROM products WHERE retailer_id=? ORDER BY id")
        .all(req.user.id),
    ),
  );
  app.post(
    "/api/retailer/products",
    requireUser,
    role("retailer"),
    (req, res) => {
      const p = productSchema.parse(req.body);
      const market = db
        .prepare("SELECT id FROM markets ORDER BY id LIMIT 1")
        .get();
      if (!market) throw new HttpError(409, "请先配置市场。");
      const result = db
        .prepare(
          `INSERT INTO products (market_id,retailer_id,name,category,art,unit,price_cents,stock,farm,description,organic,available_date,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          market.id,
          req.user.id,
          p.name,
          p.category,
          p.art,
          p.unit,
          p.price_cents,
          p.stock,
          req.user.name,
          p.description,
          Number(p.organic),
          p.available_date,
          Number(p.active),
        );
      db.prepare("INSERT INTO price_history VALUES (?,?,?)").run(
        result.lastInsertRowid,
        marketDay(),
        p.price_cents,
      );
      res
        .status(201)
        .json(
          db
            .prepare("SELECT * FROM products WHERE id=?")
            .get(result.lastInsertRowid),
        );
    },
  );
  app.put(
    "/api/retailer/products/:id",
    requireUser,
    role("retailer"),
    (req, res) => {
      const p = productSchema.parse(req.body);
      const product = db
        .prepare("SELECT id FROM products WHERE id=? AND retailer_id=?")
        .get(req.params.id, req.user.id);
      if (!product) throw new HttpError(404, "商品不存在或不属于当前商户。");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          `UPDATE products SET name=?,category=?,art=?,unit=?,price_cents=?,stock=?,description=?,organic=?,available_date=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        ).run(
          p.name,
          p.category,
          p.art,
          p.unit,
          p.price_cents,
          p.stock,
          p.description,
          Number(p.organic),
          p.available_date,
          Number(p.active),
          product.id,
        );
        db.prepare(
          "INSERT INTO price_history VALUES (?,?,?) ON CONFLICT(product_id,date) DO UPDATE SET price_cents=excluded.price_cents",
        ).run(product.id, marketDay(), p.price_cents);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      res.json(db.prepare("SELECT * FROM products WHERE id=?").get(product.id));
    },
  );
  app.get(
    "/api/retailer/dashboard",
    requireUser,
    role("retailer"),
    (req, res) => {
      const orders = getOrders(db, req.user);
      const products = db
        .prepare("SELECT * FROM products WHERE retailer_id=?")
        .all(req.user.id);
      const today = orders.filter((o) => o.pickup_date === marketDay());
      res.json({
        todayOrders: today.filter((o) => o.status !== "cancelled").length,
        pending: orders.filter((o) => o.status === "pending").length,
        revenueCents: today
          .filter((o) => o.status === "completed")
          .reduce((a, o) => a + o.total_cents, 0),
        reservedCents: today
          .filter((o) => ["pending", "confirmed"].includes(o.status))
          .reduce((a, o) => a + o.total_cents, 0),
        activeProducts: products.filter(
          (p) => p.active && p.available_date === marketDay(),
        ).length,
        lowStock: products.filter((p) => p.active && p.stock < 10),
        recentOrders: orders.slice(0, 5),
      });
    },
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "接口不存在。" }),
  );
  if (existsSync(join(staticDir, "index.html"))) {
    app.use(express.static(staticDir, { maxAge: 0 }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(join(staticDir, "index.html")),
    );
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: "提交的信息不完整或格式不正确。",
          fields: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "请求内容必须为有效 JSON。" });
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    console.error("Request failed:", error.message);
    res.status(500).json({ error: "服务器暂时无法完成请求，请重试。" });
  });
  return app;
}
