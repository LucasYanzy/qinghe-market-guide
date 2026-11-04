// Create an isolated, visibly labelled analytics demo. Never writes to the working market database.
import { execFileSync } from "node:child_process";
import { openDatabase, marketDay, hashPassword } from "../server/db.mjs";
import { shiftDate } from "../server/analytics.mjs";
const path = "./data/school-analytics-preview.sqlite";
execFileSync(process.execPath, ["scripts/seed-school-preview.mjs", path], { stdio: "inherit" });
const db = openDatabase(path), today = marketDay();
try {
  if (db.prepare("SELECT COUNT(*) AS n FROM orders").get().n && !db.prepare("SELECT 1 FROM app_metadata WHERE key='analytics_sample'").get())
    throw new Error("Refusing to mix generated orders with an unmarked dataset.");
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT OR REPLACE INTO app_metadata VALUES ('analytics_sample',?)").run(`Synthetic analytics sample, generated ${today}; not actual operations or SNAP redemption.`);
  const password = hashPassword("AnalyticsSampleOnly2026!");
  const clients = Array.from({ length: 48 }, (_, i) => {
    const email = `analytics-sample-${i + 1}@qinghe.demo`;
    db.prepare("INSERT OR IGNORE INTO users (email,name,password_hash,role) VALUES (?,?,?,'client')").run(email, `统计样本顾客 ${String(i + 1).padStart(2, "0")}`, password);
    return db.prepare("SELECT id FROM users WHERE email=?").get(email).id;
  });
  const markets = db.prepare("SELECT * FROM markets ORDER BY id").all();
  const products = db.prepare("SELECT * FROM products ORDER BY id").all();
  const slots = ["10:00–12:00", "12:00–14:00", "14:00–16:00"];
  products.forEach((p, i) => db.prepare("UPDATE products SET available_date=?,stock=?,snap_eligibility=? WHERE id=?")
    .run(today, i % 7 === 0 ? 0 : i % 5 === 0 ? 3 : 20 + i, i % 6 === 0 ? "unknown" : "eligible", p.id));
  for (const [i, m] of markets.entries()) if (i === 1 || i === 2) {
    db.prepare("UPDATE markets SET snap_status='accepted',snap_model=?,snap_verified_on=?,snap_note=? WHERE id=?")
      .run(i === 1 ? "market_tokens" : "vendor_terminal", today, "合成演示：展示现场 EBT 办理流程，不代表真实市场授权或接受。", m.id);
    db.prepare("UPDATE market_vendors SET snap_status='accepted',snap_verified_on=?,snap_note=? WHERE market_id=?")
      .run(today, "合成演示：示例参与记录，无真实商户授权。", m.id);
  }
  const insertOrder = db.prepare(`INSERT OR IGNORE INTO orders
    (id,client_id,market_id,status,total_cents,pickup_date,pickup_slot,note,payment_method,snap_eligible_cents,other_payment_cents,snap_plan_json,created_at)
    VALUES (?,?,?,?,?,?,?,'合成统计演示，无真实购买或支付。',?,?,?,?,?)`);
  const insertItem = db.prepare("INSERT INTO order_items VALUES (?,?,?,?,?,?,?)");
  for (let ago = 95; ago >= 0; ago--) {
    const date = shiftDate(today, -ago), count = 7 + Math.floor((95 - ago) / 14) + ago % 4;
    for (let k = 0; k < count; k++) {
      const m = markets[(ago * 3 + k) % markets.length];
      const catalogue = products.filter((p) => p.market_id === m.id);
      const first = catalogue[(ago + k) % catalogue.length];
      const available = catalogue.filter((p) => p.retailer_id === first.retailer_id);
      const lines = available.slice(0, 1 + (ago + k) % Math.min(3, available.length)).map((p, n) => ({ ...p,
        quantity: 1 + (k + n) % 3, price_cents: p.price_cents + ((ago + k) % 3) * 25,
        snap_eligibility: products.findIndex((x) => x.id === p.id) % 6 === 0 ? "unknown" : "eligible",
      }));
      const total = lines.reduce((n, p) => n + p.quantity * p.price_cents, 0);
      const eligible = lines.filter((p) => p.snap_eligibility === "eligible").reduce((n, p) => n + p.quantity * p.price_cents, 0);
      const market = db.prepare("SELECT * FROM markets WHERE id=?").get(m.id);
      const snap = market.snap_status === "accepted" && eligible > 0 && (ago + k) % 3 === 0;
      const cancelled = (ago + k * 2) % 11 === 0;
      const status = cancelled ? "cancelled" : ago < 5 && k % 4 === 0 ? "pending" : ago < 3 && k % 5 === 0 ? "confirmed" : "completed";
      const quote = { marketId: m.id, marketName: m.name, totalCents: total, eligibleCents: eligible,
        otherCents: total - eligible, unknownCents: total - eligible, snapAvailable: snap, snapModel: market.snap_model,
        marketVerifiedOn: today, vendorVerifiedOn: today, instructions: market.snap_note,
        items: lines.map((p) => ({ productId: p.id, name: p.name, quantity: p.quantity, lineCents: p.price_cents * p.quantity, snapEligibility: p.snap_eligibility })),
      };
      const id = `SAMPLE-${date}-${String(k).padStart(2, "0")}`;
      const result = insertOrder.run(id, clients[(ago * 7 + k * 3) % clients.length], m.id, status, total, date,
        slots[(ago + k * 2) % 3], snap ? "snap_ebt" : "pay_at_pickup", eligible, total - eligible, JSON.stringify(quote), `${date} 08:00:00`);
      if (result.changes) for (const p of lines) insertItem.run(id, p.id, p.name, p.unit, p.price_cents, p.quantity, p.retailer_id);
    }
  }
  db.exec("COMMIT");
  console.log(`Analytics demo ready at ${path}: synthetic orders across 96 days, clearly marked in the school workspace.`);
} catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; } finally { db.close(); }
