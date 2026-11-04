import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import { migrateWorkflows } from "./workflow-schema.mjs";

export const marketDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function openDatabase(
  path = "./data/market.sqlite",
  { demo = true } = {},
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('client','retailer','admin'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS markets (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL,
      address TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
      hours TEXT NOT NULL, description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, market_id INTEGER NOT NULL REFERENCES markets(id),
      retailer_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      category TEXT NOT NULL, art TEXT NOT NULL, unit TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK(price_cents > 0),
      stock INTEGER NOT NULL CHECK(stock >= 0), farm TEXT NOT NULL,
      description TEXT NOT NULL, organic INTEGER NOT NULL DEFAULT 0,
      available_date TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS price_history (
      product_id INTEGER NOT NULL REFERENCES products(id), date TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK(price_cents > 0),
      PRIMARY KEY(product_id,date)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id),
      market_id INTEGER NOT NULL REFERENCES markets(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','completed','cancelled')),
      total_cents INTEGER NOT NULL, pickup_date TEXT NOT NULL,
      pickup_slot TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT 'pay_at_pickup' CHECK(payment_method IN ('pay_at_pickup','snap_ebt')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
      name TEXT NOT NULL, unit TEXT NOT NULL, price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0), retailer_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY(order_id,product_id)
    );
    CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_pickup_market ON orders(pickup_date,market_id,status);
    CREATE INDEX IF NOT EXISTS orders_client ON orders(client_id,created_at);
    CREATE INDEX IF NOT EXISTS order_items_retailer ON order_items(retailer_id,order_id);
  `);
  migrateSchoolManagement(db);
  if (demo && !db.prepare("SELECT id FROM users LIMIT 1").get()) seed(db);
  if (demo && !db.prepare("SELECT id FROM users WHERE email=?").get("admin@qinghe.demo")) {
    db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'admin')")
      .run("admin@qinghe.demo", "Rutgers 学校管理方", hashPassword("MarketDemo2026!"));
  }
  const membershipExists = db.prepare("SELECT name FROM sqlite_master WHERE name='market_vendors'").get();
  db.exec(`CREATE TABLE IF NOT EXISTS market_vendors (
    market_id INTEGER NOT NULL REFERENCES markets(id),
    retailer_id INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (market_id,retailer_id)
  )`);
  if (!membershipExists) db.exec(`INSERT INTO market_vendors (market_id,retailer_id)
    SELECT DISTINCT market_id,retailer_id FROM products`);
  migrateSnap(db);
  migrateOperations(db);
  migrateWorkflows(db);
  return db;
}

function migrateOperations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS market_sessions (
    id INTEGER PRIMARY KEY, market_id INTEGER NOT NULL REFERENCES markets(id), date TEXT NOT NULL,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, cutoff TEXT NOT NULL,
    slot_minutes INTEGER NOT NULL, capacity INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
    version INTEGER NOT NULL DEFAULT 0, UNIQUE(market_id,date)
  );
  CREATE TABLE IF NOT EXISTS vendor_profiles (
    retailer_id INTEGER PRIMARY KEY REFERENCES users(id), contact_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', staff_managed INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS operation_events (
    id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id), entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL, action TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS operation_events_entity ON operation_events(entity_type,entity_id,id);
  CREATE TABLE IF NOT EXISTS order_receipts (
    order_id TEXT PRIMARY KEY REFERENCES orders(id), cash_cents INTEGER NOT NULL DEFAULT 0,
    card_cents INTEGER NOT NULL DEFAULT 0, snap_cents INTEGER NOT NULL DEFAULT 0,
    reference TEXT NOT NULL DEFAULT '', recorded_by INTEGER NOT NULL REFERENCES users(id),
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  for (const [table, name, definition] of [
    ['markets', 'schedule_required', 'INTEGER NOT NULL DEFAULT 0'],
    ['orders', 'market_session_id', 'INTEGER REFERENCES market_sessions(id)'],
    ['orders', 'pickup_code', "TEXT NOT NULL DEFAULT ''"],
  ]) if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  for (const order of db.prepare("SELECT id FROM orders WHERE pickup_code=''").all())
    db.prepare('UPDATE orders SET pickup_code=? WHERE id=?').run(String(randomInt(100000, 1000000)), order.id);
}

function migrateSnap(db) {
  const fields = {
    markets: [
      ["snap_status", "TEXT NOT NULL DEFAULT 'unconfirmed' CHECK(snap_status IN ('unconfirmed','accepted','unavailable'))"],
      ["snap_model", "TEXT NOT NULL DEFAULT 'unconfirmed' CHECK(snap_model IN ('unconfirmed','market_tokens','vendor_terminal'))"],
      ["snap_verified_on", "TEXT NOT NULL DEFAULT ''"], ["snap_note", "TEXT NOT NULL DEFAULT ''"],
    ],
    market_vendors: [
      ["snap_status", "TEXT NOT NULL DEFAULT 'unconfirmed' CHECK(snap_status IN ('unconfirmed','accepted','unavailable'))"],
      ["snap_verified_on", "TEXT NOT NULL DEFAULT ''"], ["snap_note", "TEXT NOT NULL DEFAULT ''"],
    ],
    products: [["snap_eligibility", "TEXT NOT NULL DEFAULT 'unknown' CHECK(snap_eligibility IN ('eligible','ineligible','unknown'))"]],
    orders: [
      ["payment_method", "TEXT NOT NULL DEFAULT 'pay_at_pickup' CHECK(payment_method IN ('pay_at_pickup','snap_ebt'))"],
      ["snap_eligible_cents", "INTEGER NOT NULL DEFAULT 0"],
      ["other_payment_cents", "INTEGER NOT NULL DEFAULT 0"],
      ["snap_plan_json", "TEXT NOT NULL DEFAULT '[]'"],
    ],
  };
  for (const [table, definitions] of Object.entries(fields)) {
    const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [name, definition] of definitions)
      if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function migrateSchoolManagement(db) {
  const users = db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get();
  if (!users.sql.includes("'admin'")) {
    // Rebuild the legacy CHECK constraint while preserving IDs and all references.
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE users_next (
          id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          name TEXT NOT NULL, password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('client','retailer','admin'))
        );
        INSERT INTO users_next SELECT id,email,name,password_hash,role FROM users;
        DROP TABLE users;
        ALTER TABLE users_next RENAME TO users;
        COMMIT;`);
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }
  const columns = new Set(db.prepare("PRAGMA table_info(markets)").all().map((c) => c.name));
  for (const [name, definition] of [
    ["active", "INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))"],
    ["preorders_enabled", "INTEGER NOT NULL DEFAULT 1 CHECK(preorders_enabled IN (0,1))"],
    ["community", "TEXT NOT NULL DEFAULT ''"],
    ["coverage_radius_km", "REAL NOT NULL DEFAULT 3 CHECK(coverage_radius_km > 0 AND coverage_radius_km <= 100)"],
  ]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE markets ADD COLUMN ${name} ${definition}`);
  }
}

function seed(db) {
  const today = marketDay();
  db.exec("BEGIN IMMEDIATE");
  try {
    const user = db.prepare(
      "INSERT INTO users (id,email,name,password_hash,role) VALUES (?,?,?,?,?)",
    );
    user.run(
      1,
      "client@qinghe.demo",
      "林同学",
      hashPassword("MarketDemo2026!"),
      "client",
    );
    user.run(
      2,
      "retailer@qinghe.demo",
      "Green Acre 农场",
      hashPassword("MarketDemo2026!"),
      "retailer",
    );
    db.prepare("INSERT INTO markets (id,name,subtitle,address,latitude,longitude,hours,description) VALUES (?,?,?,?,?,?,?,?)").run(
      1,
      "Rutgers Gardens 社区市集",
      "让校园与在地农场相遇",
      "130 Log Cabin Rd, North Brunswick, NJ 08902",
      40.4736,
      -74.4352,
      "演示自提时段 10:00–16:00（美国东部时间）",
      "在花园旁，遇见一季一会的新鲜。市场地点用于路线演示，营业日与摊位信息为示例，出发前请核实官方安排。",
    );
    const products = [
      [
        "藤熟番茄",
        "果实类",
        "tomato",
        "磅",
        350,
        36,
        "Green Acre 农场",
        "阳光下自然成熟，酸甜多汁。适合沙拉、意面与一切家常好味。",
        1,
      ],
      [
        "田园西兰花",
        "叶菜类",
        "broccoli",
        "颗",
        280,
        24,
        "Green Acre 农场",
        "清晨采收，花球紧实。简单蒸煮，就能尝到田间的清甜。",
        1,
      ],
      [
        "彩虹胡萝卜",
        "根茎类",
        "carrot",
        "把",
        420,
        18,
        "Green Acre 农场",
        "带着泥土香的脆甜，一把收集秋日的明亮颜色。",
        1,
      ],
      [
        "奶油生菜",
        "叶菜类",
        "lettuce",
        "颗",
        250,
        32,
        "Green Acre 农场",
        "柔嫩叶片，口感清爽。做一份轻盈的沙拉或三明治。",
        0,
      ],
      [
        "秋收小南瓜",
        "果实类",
        "pumpkin",
        "个",
        500,
        14,
        "Green Acre 农场",
        "绵密金黄，烤一烤或煮一锅浓汤，把秋天端上桌。",
        0,
      ],
      [
        "迷你黄瓜",
        "果实类",
        "cucumber",
        "磅",
        300,
        28,
        "Green Acre 农场",
        "脆嫩少籽，清爽鲜甜。洗净即食，也是腌渍的好选择。",
        1,
      ],
      [
        "农场土豆",
        "根茎类",
        "potato",
        "磅",
        220,
        45,
        "Green Acre 农场",
        "朴实的土香与细腻口感，烘烤、炖煮都好吃。",
        0,
      ],
      [
        "紫皮洋葱",
        "根茎类",
        "onion",
        "磅",
        260,
        22,
        "Green Acre 农场",
        "外皮紫红，辛香回甘。为日常餐桌添一点层次。",
        0,
      ],
    ];
    const insert = db.prepare(`INSERT INTO products
      (market_id,retailer_id,name,category,art,unit,price_cents,stock,farm,description,organic,available_date)
      VALUES (1,2,?,?,?,?,?,?,?,?,?,?)`);
    const history = db.prepare("INSERT INTO price_history VALUES (?,?,?)");
    for (const [i, p] of products.entries()) {
      const result = insert.run(...p, today);
      for (let day = 27; day >= 0; day--) {
        const date = new Date(`${today}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - day);
        const base = p[4];
        const price =
          day === 0
            ? base
            : Math.max(
                50,
                Math.round(
                  base +
                    day * (i % 2 ? -1.8 : 2.4) +
                    Math.sin(day * 0.7 + i) * 18,
                ),
              );
        history.run(
          result.lastInsertRowid,
          date.toISOString().slice(0, 10),
          price,
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
