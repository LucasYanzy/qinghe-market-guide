import express from "express";
import { installHttpPolicy } from "./http-policy.mjs";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { resolve, join, sep } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import catalogOptions from "../references/catalog-options.json" with { type: "json" };
import { marketDay, hashPassword } from "./db.mjs";
import { forecastPrices } from "./forecast.mjs";
import { createAdminRouter } from "./admin.mjs";
import { createWorkflowsRouter } from "./workflows.mjs";
import { productPerformance, reportPeriod } from "./analytics.mjs";
import { vendorProfitability } from './financial-reports.mjs';
import { daySchema, pickupOptions, recordPickup } from "./operations.mjs";
import {
  getOrders,
  placeOrder,
  priceCart,
  updateOrderStatus,
  HttpError,
  pickupSlots,
} from "./services.mjs";

const productSchema = z.object({
  market_id: z.number().int().positive().optional(),
  snap_eligibility: z.enum(["eligible", "ineligible", "unknown"]).optional(),
  name: z.string().trim().min(1).max(50),
  category: z.enum(catalogOptions.categories),
  art: z.enum(Object.keys(catalogOptions.artLabels)),
  unit: z.enum(catalogOptions.units),
  price_cents: z.number().int().min(1).max(100000),
  stock: z.number().min(0).max(10000).refine(n => Math.abs(n*1000-Math.round(n*1000))<1e-7),
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
const orderItemsSchema = z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive().max(100).refine(n => Math.abs(n*1000-Math.round(n*1000))<1e-7) })).min(1).max(50);
const digest = (token) => createHash("sha256").update(token).digest("hex");
// Generate once so nonexistent accounts do the same password work per request
// as existing accounts, without revealing email existence through a second KDF.
const dummyPasswordHash = hashPassword("constant-time-dummy");

export function createApp(
  db,
  { demo = true, secureCookie = false, staticDir = resolve("dist"), authAttemptLimit = 20, trustProxy = 0, publicOrigin } = {},
) {
  const app = express();
  installHttpPolicy(app, { trustProxy, publicOrigin, secureCookie });
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
          `SELECT u.id,u.email,u.name,COALESCE(r.role,u.role) AS role FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN session_roles r ON r.token_hash=s.token_hash
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
    roles: [...new Set([user.role,...db.prepare('SELECT role FROM user_roles WHERE user_id=?').all(user.id).map(r=>r.role)])],
  });
  const session = (req, res, user) => {
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      digest(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    db.prepare('INSERT INTO session_roles VALUES (?,?)').run(digest(token),user.role);
    // Both login and registration can switch the browser to another account.
    const previous = req.headers.cookie?.split(";").map(x => x.trim())
      .find(x => x.startsWith("qinghe_session="))?.slice(15);
    if (previous) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(previous));
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
    if (entry && entry.until > now && entry.count >= authAttemptLimit)
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
  app.get("/api/auth/me", (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  app.post('/api/auth/role', requireUser, (req,res) => {
    const p=z.object({role:z.enum(['client','retailer','admin'])}).strict().parse(req.body);
    const roles=publicUser(req.user).roles;
    if (!roles.includes(p.role)) throw new HttpError(403,'当前账号无权进行此操作。');
    const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('qinghe_session='))?.slice(15);
    db.prepare('INSERT INTO session_roles VALUES (?,?) ON CONFLICT(token_hash) DO UPDATE SET role=excluded.role').run(digest(cookie),p.role);
    res.json({user:publicUser({...req.user,role:p.role})});
  });
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
      user?.password_hash ?? dummyPasswordHash
    ).split(":");
    const valid = timingSafeEqual(
      Buffer.from(hash, "hex"),
      scryptSync(input.password, salt, 64),
    );
    if (!user || !valid) throw new HttpError(401, "邮箱或密码不正确。");
    res.json({ user: session(req, res, user) });
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
    db.prepare("INSERT INTO user_roles VALUES (?,'client')").run(result.lastInsertRowid);
    res
      .status(201)
      .json({
        user: session(req, res, {
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
    res.json(db.prepare("SELECT * FROM markets WHERE active=1").all()),
  );
  app.get("/api/products", (req, res) => {
    const date = daySchema.parse(req.query.date ?? marketDay());
    const category =
      typeof req.query.category === "string" ? req.query.category : "";
    const search =
      typeof req.query.search === "string" ? req.query.search.slice(0, 80) : "";
    const marketId=req.query.marketId===undefined?0:z.coerce.number().int().positive().parse(req.query.marketId);
    res.json(
      db
        .prepare(
          `SELECT p.*,m.name AS market_name,m.address AS market_address FROM products p JOIN markets m ON m.id=p.market_id
      WHERE p.active=1 AND p.available_date=? AND m.active=1 AND m.preorders_enabled=1
      AND NOT EXISTS (SELECT 1 FROM market_sessions s WHERE s.market_id=p.market_id AND s.date=p.available_date AND s.cancelled=1)
      AND (?=0 OR p.market_id=?)
      AND (?='' OR p.category=?) AND (?='' OR instr(p.name,?)>0 OR instr(p.farm,?)>0) ORDER BY p.id`,
        )
        .all(date, marketId,marketId,category, category, search, search, search),
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
  app.get("/api/order-submissions/:key", requireUser, role("client"), (req,res) => {
    const key = z.string().min(8).max(128).parse(req.params.key);
    const row = db.prepare("SELECT order_id FROM order_submissions WHERE client_id=? AND submission_key=?").get(req.user.id,key);
    if (!row) throw new HttpError(404,"未找到上次提交的预购，请核对订单列表后重试。");
    res.json(getOrders(db,req.user).find(order=>order.id===row.order_id));
  });
  app.post("/api/checkout/quote", (req, res) => {
    const input = z.object({ items: orderItemsSchema }).parse(req.body);
    res.json(priceCart(db, input).quote);
  });
  app.get('/api/checkout/options', (req, res) => {
    const marketId = z.coerce.number().int().positive().parse(req.query.marketId);
    res.json(pickupOptions(db, marketId, daySchema.parse(req.query.date ?? marketDay()), { requireSchedule: !demo }));
  });
  app.post("/api/orders", requireUser, role("client"), (req, res) => {
    const input = z
      .object({
        items: orderItemsSchema,
        pickupSlot: z.string().regex(/^\d{2}:\d{2}–\d{2}:\d{2}$/),
        note: z.string().trim().max(300).default(""),
        paymentMethod: z.enum(["pay_at_pickup", "snap_ebt"]).default("pay_at_pickup"),
      })
      .parse(req.body);
    const submissionKey = req.get('Idempotency-Key') === undefined ? undefined : z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/).parse(req.get('Idempotency-Key'));
    res.status(201).json(placeOrder(db, req.user, input, { requireSchedule: !demo, submissionKey }));
  });
  app.post('/api/orders/:id/pickup', requireUser, role('retailer'), (req, res) => {
    const owns = db.prepare('SELECT COUNT(*) AS n,COUNT(CASE WHEN retailer_id=? THEN 1 END) AS owned FROM order_items WHERE order_id=?').get(req.user.id, req.params.id);
    if (!owns.n || owns.owned !== owns.n) throw new HttpError(403, '无权操作此订单。');
    res.json(recordPickup(db, req.user, req.params.id, req.body));
  });
  app.patch("/api/orders/:id/status", requireUser, (req, res) => {
    if (!["client", "retailer"].includes(req.user.role)) throw new HttpError(403, "当前账号无权进行此操作。");
    const input = z
      .object({ status: z.enum(["confirmed", "completed", "cancelled"]) })
      .parse(req.body);
    res.json(updateOrderStatus(db, req.user, req.params.id, input.status));
  });
  app.use('/api', createWorkflowsRouter(db));
  app.use("/api/admin", requireUser, role("admin"), createAdminRouter(db));
  app.get("/api/retailer/markets", requireUser, role("retailer"), (req, res) =>
    res.json(db.prepare(`SELECT m.* FROM markets m JOIN market_vendors mv ON mv.market_id=m.id
      WHERE mv.retailer_id=? ORDER BY m.id`).all(req.user.id)),
  );
  app.get("/api/retailer/products", requireUser, role("retailer"), (req, res) =>
    res.json(
      db
        .prepare("SELECT p.*,m.name AS market_name FROM products p JOIN markets m ON m.id=p.market_id WHERE retailer_id=? ORDER BY p.id")
        .all(req.user.id),
    ),
  );
  app.post(
    "/api/retailer/products",
    requireUser,
    role("retailer"),
    (req, res) => {
      const p = productSchema.parse(req.body);
      if (Math.abs(p.stock*1000-Math.round(p.stock*1000))>1e-7 || p.unit!=="磅" && !Number.isInteger(p.stock)) throw new HttpError(400,"库存数量无效；称重商品最多支持三位小数，其他商品需为整数。");
      const market = db
        .prepare(`SELECT m.id FROM markets m JOIN market_vendors mv ON mv.market_id=m.id
          WHERE mv.retailer_id=? AND m.active=1 AND (?=0 OR m.id=?) ORDER BY m.id LIMIT 1`)
        .get(req.user.id, p.market_id ?? 0, p.market_id ?? 0);
      if (!market) throw new HttpError(409, "请先由学校分配启用中的入驻市场。");
      const result = db
        .prepare(
          `INSERT INTO products (market_id,retailer_id,name,category,art,unit,price_cents,stock,farm,description,organic,available_date,active,snap_eligibility)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
          db.prepare("SELECT business_name FROM vendor_directory WHERE id=?").get(req.user.id).business_name,
          p.description,
          Number(p.organic),
          p.available_date,
          Number(p.active),
          p.snap_eligibility ?? "unknown",
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
      if (Math.abs(p.stock*1000-Math.round(p.stock*1000))>1e-7 || p.unit!=="磅" && !Number.isInteger(p.stock)) throw new HttpError(400,"库存数量无效；称重商品最多支持三位小数，其他商品需为整数。");
      const product = db
        .prepare("SELECT id,market_id,snap_eligibility FROM products WHERE id=? AND retailer_id=?")
        .get(req.params.id, req.user.id);
      if (!product) throw new HttpError(404, "商品不存在或不属于当前商户。");
      const marketId = p.market_id ?? product.market_id;
      if ((p.active || marketId !== product.market_id) && !db.prepare(
        "SELECT 1 FROM market_vendors WHERE market_id=? AND retailer_id=?",
      ).get(marketId, req.user.id)) throw new HttpError(403, "尚未获准入驻该市场。");
      if ((marketId !== product.market_id || p.available_date !== db.prepare("SELECT available_date FROM products WHERE id=?").get(product.id).available_date) && db.prepare(`SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id
        WHERE i.product_id=? AND o.status IN ('pending','confirmed') LIMIT 1`).get(product.id))
        throw new HttpError(409, "该商品仍有待履约订单，完成或取消后才能更换市场。");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          `UPDATE products SET name=?,category=?,art=?,unit=?,price_cents=?,stock=?,description=?,organic=?,available_date=?,active=?,market_id=?,snap_eligibility=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
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
          marketId,
          p.snap_eligibility ?? product.snap_eligibility,
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
  app.get("/api/retailer/analytics", requireUser, role("retailer"), (req, res) => {
    const range = z.enum(["7", "30", "90"]).parse(req.query.range ?? "30");
    const period = reportPeriod(range);
    res.json({ from: period.from, to: period.to, products: productPerformance(db, period, null, req.user.id), profitability: vendorProfitability(db, period, req.user.id),
      previousProducts: productPerformance(db, period.previous, null, req.user.id),
      sampleData: !!db.prepare("SELECT 1 FROM app_metadata WHERE key='analytics_sample'").get() });
  });
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
    app.use(express.static(staticDir, {
      maxAge: 0,
      setHeaders(res, file) {
        if (file.startsWith(join(resolve(staticDir), "assets") + sep))
          res.set("Cache-Control", "public, max-age=31536000, immutable");
      },
    }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile("index.html", { root: staticDir }),
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
      return res.status(error.status).json({
        error: error.message,
        ...(error.messageKey ? { messageKey: error.messageKey, values: error.values } : {}),
      });
    console.error("Request failed:", error.message);
    res.status(500).json({ error: "服务器暂时无法完成请求，请重试。" });
  });
  return app;
}
