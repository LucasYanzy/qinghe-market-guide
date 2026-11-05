import { randomUUID, randomInt, createHash } from "node:crypto";
import { marketDay } from "./db.mjs";
import { snapPlan } from "./snap.mjs";
import { audit, checkPickup, validDay } from "./operations.mjs";
import { notifyOrder, notifyUser } from "./notifications.mjs";

export class HttpError extends Error {
  constructor(status, message, values) {
    super(values ? message.replace(/\{(\w+)\}/g, (match, key) =>
      Object.hasOwn(values, key) ? String(values[key]) : match,
    ) : message);
    this.status = status;
    this.values = values;
    this.messageKey = values ? message : undefined;
  }
}
export const pickupSlots = ["10:00–12:00", "12:00–14:00", "14:00–16:00"];

export function getOrders(db, user) {
  const orders =
    user.role === "retailer"
      ? db
          .prepare(
            `SELECT DISTINCT o.*,u.name AS client_name FROM orders o
        JOIN users u ON u.id=o.client_id JOIN order_items i ON i.order_id=o.id
        WHERE i.retailer_id=? ORDER BY o.created_at DESC,o.id DESC`,
          )
          .all(user.id)
      : db
          .prepare(
            "SELECT o.*,u.name AS client_name FROM orders o JOIN users u ON u.id=o.client_id WHERE client_id=? ORDER BY created_at DESC,id DESC",
          )
          .all(user.id);
  return orders.map((order) => ({
    ...order,
    original_total_cents: order.total_cents,
    total_cents: order.final_total_cents ?? order.total_cents,
    snap_eligible_cents: order.final_snap_eligible_cents ?? order.snap_eligible_cents,
    other_payment_cents: (order.final_total_cents ?? order.total_cents) - (order.final_snap_eligible_cents ?? order.snap_eligible_cents),
    adjustment: (() => { const a = db.prepare('SELECT * FROM order_adjustments WHERE order_id=?').get(order.id); return a ? { ...a, items: JSON.parse(a.items_json) } : null; })(),
    pickup_code: user.role === 'client' ? order.pickup_code : undefined,
    receipt: db.prepare('SELECT cash_cents,card_cents,snap_cents,reference,recorded_at FROM order_receipts WHERE order_id=?').get(order.id) ?? null,
    history: db.prepare("SELECT action,detail_json,created_at FROM operation_events WHERE entity_type='order' AND entity_id=? ORDER BY id").all(order.id).map((e) => ({ ...e, detail: JSON.parse(e.detail_json) })),
    snap_plan: order.payment_method === "snap_ebt" ? effectiveSnapPlan(db, order) : null,
    items: db
      .prepare("SELECT * FROM effective_order_items WHERE order_id=?")
      .all(order.id),
  }));
}

// Keep the eligibility/verification snapshot while reflecting customer-approved quantities.
function effectiveSnapPlan(db, order) {
  const plan = JSON.parse(order.snap_plan_json);
  if (order.final_total_cents === null) return plan;
  const effective = db.prepare('SELECT * FROM effective_order_items WHERE order_id=?').all(order.id);
  const items = plan.items.map(item => {
    const actual = effective.find(row => row.product_id === item.productId);
    return actual ? { ...item, quantity: actual.quantity, lineCents: Math.round(actual.price_cents * actual.quantity) } : item;
  });
  return { ...plan, items, totalCents: order.final_total_cents, eligibleCents: order.final_snap_eligible_cents,
    otherCents: order.final_total_cents - order.final_snap_eligible_cents,
    unknownCents: items.filter(item => item.snapEligibility === 'unknown').reduce((sum,item) => sum + item.lineCents,0) };
}

export function priceCart(db, input) {
  const existing = new Set();
  let marketId,
    retailerId,
    total = 0, pickupDate;
  const items = input.items.map((item) => {
    if (existing.has(item.productId))
      throw new HttpError(400, "购物袋中包含重复商品。");
    existing.add(item.productId);
    const product = db
      .prepare("SELECT * FROM products WHERE id=? AND active=1")
      .get(item.productId);
    if (!product || !validDay(product.available_date) || product.available_date < marketDay())
      throw new HttpError(409, "部分商品已不在今日售卖列表，请刷新。");
    if (pickupDate && pickupDate !== product.available_date) throw new HttpError(400, "一笔订单只能选择同一自提日期的商品。");
    pickupDate = product.available_date;
    if (product.stock < item.quantity)
      throw new HttpError(
        409,
        "{product} 库存不足，当前剩余 {stock} {unit}。",
        { product: product.name, stock: product.stock, unit: product.unit },
      );
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 100 ||
      Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 1e-7 || (product.unit !== '磅' && !Number.isInteger(item.quantity)))
      throw new HttpError(400, "数量无效；称重商品最多支持三位小数，其他商品需为整数。");
    if (
      marketId &&
      (marketId !== product.market_id || retailerId !== product.retailer_id)
    )
      throw new HttpError(400, "每笔订单仅支持同一市场、同一商户的商品。");
    marketId = product.market_id;
    retailerId = product.retailer_id;
    const market = db.prepare("SELECT active,preorders_enabled FROM markets WHERE id=?").get(marketId);
    if (!market?.active || !market.preorders_enabled)
      throw new HttpError(409, "该市场已暂停预购，请刷新后选择其他市场。");
    if (!db.prepare("SELECT 1 FROM market_vendors WHERE market_id=? AND retailer_id=?").get(marketId, retailerId))
      throw new HttpError(409, "商户已退出该市场，请刷新商品列表。");
    const lineCents = Math.round(product.price_cents * item.quantity);
    if (lineCents < 1) throw new HttpError(400, "每项商品的金额需至少为一美分，请增加数量。");
    total += lineCents;
    return { ...product, quantity: item.quantity };
  });
  return { items, marketId, retailerId, total, pickupDate, quote: snapPlan(db, marketId, retailerId, items) };
}

export function placeOrder(db, user, input, options = {}) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const requestHash = createHash('sha256').update(JSON.stringify({ items: [...input.items].sort((a,b) => a.productId-b.productId), pickupSlot: input.pickupSlot,
      note: input.note ?? '', paymentMethod: input.paymentMethod ?? 'pay_at_pickup' })).digest('hex');
    if (options.submissionKey) {
      const existing = db.prepare('SELECT * FROM order_submissions WHERE client_id=? AND submission_key=?').get(user.id, options.submissionKey);
      if (existing) {
        if (existing.request_hash !== requestHash) throw new HttpError(409, "此提交标识已用于另一份预购，请刷新后重新确认。");
        const result = getOrders(db, user).find(order => order.id === existing.order_id);
        db.exec('COMMIT'); return result;
      }
    }
    const { items, marketId, total, quote, pickupDate } = priceCart(db, input);
    const sessionId = checkPickup(db, marketId, pickupDate, input.pickupSlot, options);
    const paymentMethod = input.paymentMethod ?? "pay_at_pickup";
    if (paymentMethod === "snap_ebt" && (!quote.snapAvailable || quote.eligibleCents <= 0))
      throw new HttpError(409, "当前市场、商户或商品尚不满足 SNAP/EBT 预购条件，请选择其他现场付款方式。");
    const id = `QH-${randomUUID().slice(0, 8).toUpperCase()}`;
    db.prepare(
      "INSERT INTO orders (id,client_id,market_id,total_cents,pickup_date,pickup_slot,note,payment_method,snap_eligible_cents,other_payment_cents,snap_plan_json,market_session_id,pickup_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      user.id,
      marketId,
      total,
      pickupDate,
      input.pickupSlot,
      input.note,
      paymentMethod,
      quote.eligibleCents,
      quote.otherCents,
      JSON.stringify(quote),
      sessionId,
      String(randomInt(100000, 1000000)),
    );
    const insert = db.prepare("INSERT INTO order_items VALUES (?,?,?,?,?,?,?)");
    for (const item of items) {
      db.prepare("UPDATE products SET stock=ROUND(stock-?,3) WHERE id=?").run(
        item.quantity,
        item.id,
      );
      insert.run(
        id,
        item.id,
        item.name,
        item.unit,
        item.price_cents,
        item.quantity,
        item.retailer_id,
      );
    }
    audit(db, user.id, 'order', id, 'order_placed', { to: 'pending' });
    if (options.submissionKey) db.prepare('INSERT INTO order_submissions VALUES (?,?,?,?)').run(user.id, options.submissionKey, requestHash, id);
    notifyOrder(db, id, 'placed', "预购 {id} 已收到，请等待备货确认。");
    for (const vendorId of new Set(items.map(item => item.retailer_id))) notifyUser(db, vendorId, 'new_order', id, "收到新预购 {id}，请核对供货。", { id });
    db.exec("COMMIT");
    return getOrders(db, user).find((order) => order.id === id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateOrderStatus(db, user, id, status, { reason = '' } = {}) {
  if (!["client", "retailer", "admin"].includes(user.role))
    throw new HttpError(403, "当前账号无权进行此操作。");
  db.exec("BEGIN IMMEDIATE");
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    if (!order) throw new HttpError(404, "订单不存在。");
    const items = db
      .prepare("SELECT * FROM effective_order_items WHERE order_id=?")
      .all(id);
    const owns =
      user.role === "admin" ? true : user.role === "retailer"
        ? items.every((i) => i.retailer_id === user.id)
        : order.client_id === user.id;
    if (!owns) throw new HttpError(403, "无权操作此订单。");
    if (
      user.role === "client" &&
      (status !== "cancelled" || order.status !== "pending")
    )
      throw new HttpError(409, "仅待确认订单支持由顾客取消。");
    const allowed = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[order.status].includes(status))
      throw new HttpError(409, "订单状态已更新，请刷新后重试。");
    if (status === 'completed')
      throw new HttpError(409, "此订单需要核对取货码并登记现场收款后完成。");
    if (user.role === 'admin' && status === 'cancelled' && !reason.trim())
      throw new HttpError(400, "请填写取消原因，便于现场交接和后续追溯。");
    db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, id);
    if (status === "cancelled")
      for (const item of items)
        db.prepare("UPDATE products SET stock=ROUND(stock+?,3) WHERE id=?").run(
          item.quantity,
          item.product_id,
        );
    audit(db, user.id, 'order', id, status === 'cancelled' ? 'order_cancelled' : status === 'confirmed' ? 'order_confirmed' : 'legacy_completed', { from: order.status, to: status, reason });
    notifyOrder(db, id, status, status === 'cancelled' ? "预购 {id} 已取消。原因：{reason}" : status === 'confirmed' ? "预购 {id} 已确认，请按约定时段到场取货。" : "预购 {id} 已完成。", status === 'cancelled' ? { reason: reason || '—' } : {});
    db.exec("COMMIT");
    return user.role === 'admin' ? { id, status } : getOrders(db, user).find((o) => o.id === id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
