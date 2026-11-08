// Explicitly invoked by the browser-only demo, never by server startup or an API
// route. Historical samples are additive; live inventory/configuration is untouched.
import { emptyTenders, tenderTotal } from './tenders.mjs';

const marker = 'browser-analytics-sample-v1';
const shift = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export function demoAnalyticsStatus(db) {
  const saved = db.prepare('SELECT value FROM app_metadata WHERE key=?').get(marker);
  return saved ? JSON.parse(saved.value) : null;
}

export function addDemoAnalytics(db, today) {
  const previous = demoAnalyticsStatus(db);
  if (previous) return previous;
  const vendor = db.prepare("SELECT id,password_hash FROM users WHERE email='retailer@qinghe.demo'").get();
  const admin = db.prepare("SELECT id FROM users WHERE email='admin@qinghe.demo'").get();
  const products = vendor && db.prepare(`SELECT p.* FROM products p JOIN market_vendors mv ON mv.market_id=p.market_id AND mv.retailer_id=p.retailer_id
    WHERE p.retailer_id=? AND p.market_id=1 AND p.active=1 ORDER BY p.id LIMIT 48`).all(vendor.id);
  if (!admin || !products?.length) throw new Error('Demo catalogue unavailable');
  db.exec('BEGIN IMMEDIATE');
  try {
    const clients = Array.from({ length: 24 }, (_, i) => {
      const email = `chart-sample-${i + 1}@qinghe.demo`;
      db.prepare("INSERT OR IGNORE INTO users (email,name,password_hash,role) VALUES (?,?,?,'client')")
        .run(email, `Chart sample ${String(i + 1).padStart(2, '0')}`, vendor.password_hash);
      const id = db.prepare('SELECT id FROM users WHERE email=?').get(email).id;
      db.prepare("INSERT OR IGNORE INTO user_roles VALUES (?,'client')").run(id);
      return id;
    });
    const insertOrder = db.prepare(`INSERT INTO orders
      (id,client_id,market_id,status,total_cents,pickup_date,pickup_slot,note,payment_method,snap_eligible_cents,other_payment_cents,snap_plan_json,created_at,market_session_id,pickup_code)
      VALUES (?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let orders = 0, sessions = 0;
    for (let ago = 84; ago >= 1; ago--) {
      if (ago % 7 !== 2 && ago % 7 !== 5) continue;
      const date = shift(today, -ago);
      // User-created sessions and reports are never rewritten or supplemented.
      if (db.prepare('SELECT 1 FROM market_sessions WHERE market_id=1 AND date=?').get(date)) continue;
      const sessionId = Number(db.prepare(`INSERT INTO market_sessions
        (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,status,notice)
        VALUES (1,?,'10:00','16:00','09:00',120,30,'closed','Synthetic history; not an official operating record.')`).run(date).lastInsertRowid);
      db.prepare("INSERT INTO session_vendors (session_id,retailer_id,status,note) VALUES (?,?,'checked_in','Synthetic history')").run(sessionId, vendor.id);
      const tenders = emptyTenders();
      let completed = 0;
      const count = 4 + Math.floor((84 - ago) / 14) + ago % 3;
      for (let k = 0; k < count; k++) {
        const first = (ago + k * k) % products.length;
        const lines = [products[first], products[(first + 3) % products.length]]
          .filter((p, index, rows) => rows.findIndex(row => row.id === p.id) === index)
          .map((p, index) => ({ ...p, quantity: 1 + (k + index) % 3 }));
        const total = lines.reduce((sum, p) => sum + p.quantity * p.price_cents, 0);
        const cancelled = (ago + k) % 9 === 0;
        const snap = k % 4 === 0;
        const eligible = snap ? lines[0].quantity * lines[0].price_cents : 0;
        const id = `CHART-SAMPLE-${date}-${k}`;
        const client = ago <= 21 && k % 2 === 0 ? 16 + k % 8 : (ago + k * 3) % 16;
        const quote = { marketId: 1, totalCents: total, eligibleCents: eligible, otherCents: total - eligible,
          unknownCents: 0, snapAvailable: snap, snapModel: 'vendor_terminal',
          instructions: 'Synthetic history: simulated payment, not current acceptance or real redemption.',
          items: lines.map((p, index) => ({ productId: p.id, name: p.name, quantity: p.quantity,
            lineCents: p.quantity * p.price_cents, snapEligibility: snap && index === 0 ? 'eligible' : 'ineligible' })) };
        insertOrder.run(id, clients[client], cancelled ? 'cancelled' : 'completed', total, date,
          ['10:00–12:00', '12:00–14:00', '14:00–16:00'][(ago + k) % 3], 'Synthetic history; does not consume current stock.',
          snap ? 'snap_ebt' : 'pay_at_pickup', eligible, total - eligible, JSON.stringify(quote), `${date} 12:00:00`, sessionId, String(100000 + orders));
        for (const p of lines) db.prepare('INSERT INTO order_items VALUES (?,?,?,?,?,?,?)')
          .run(id, p.id, p.name, p.unit, p.price_cents, p.quantity, vendor.id);
        if (!cancelled) {
          const cash = k % 2 ? total - eligible : 0, card = total - eligible - cash;
          db.prepare('INSERT INTO order_receipts VALUES (?,?,?,?,?,?,?)')
            .run(id, cash, card, eligible, 'Synthetic history', vendor.id, `${date} 17:00:00`);
          tenders.cashCents += cash; tenders.creditCents += card; tenders.snapCents += eligible;
          completed++;
        }
        orders++;
      }
      // Whole-session reporting includes platform receipts plus distinct simulated
      // walk-up purchases. It is not a second amount to add to platform revenue.
      Object.assign(tenders, { checkCents: 200, goodFoodBucksCents: 500 + ago % 4 * 100,
        marketBucksCents: 300, qrCents: 600, matchCents: 400 });
      const gross = tenderTotal(tenders);
      db.prepare(`INSERT INTO vendor_sales_reports
        (session_id,retailer_id,gross_cents,transactions,note,recorded_by,updated_at,tenders_json,goods_cost_cents,operating_cost_cents)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(sessionId, vendor.id, gross, completed + 5, 'Synthetic history, including platform orders and separate walk-up purchases.', admin.id,
        `${date} 21:00:00`, sessions % 5 === 0 ? null : JSON.stringify(tenders), Math.round(gross * 0.56), Math.round(gross * 0.18));
      sessions++;
    }
    if (!orders) throw new Error('No unused demo sessions available');
    const status = { from: shift(today, -84), to: shift(today, -1), orders, sessions };
    db.prepare('INSERT INTO app_metadata VALUES (?,?)').run(marker, JSON.stringify(status));
    db.prepare("INSERT OR IGNORE INTO app_metadata VALUES ('analytics_sample','Includes explicitly loaded synthetic history and this tab’s interactive changes.')").run();
    db.exec('COMMIT');
    return status;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
