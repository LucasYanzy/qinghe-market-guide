import { randomUUID } from "node:crypto";
import { marketDay } from "./db.mjs";

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
    items: db
      .prepare("SELECT * FROM order_items WHERE order_id=?")
      .all(order.id),
  }));
}

export function placeOrder(db, user, input) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = new Set();
    let marketId,
      retailerId,
      total = 0;
    const items = input.items.map((item) => {
      if (existing.has(item.productId))
        throw new HttpError(400, "购物袋中包含重复商品。");
      existing.add(item.productId);
      const product = db
        .prepare("SELECT * FROM products WHERE id=? AND active=1")
        .get(item.productId);
      if (!product || product.available_date !== marketDay())
        throw new HttpError(409, "部分商品已不在今日售卖列表，请刷新。");
      if (product.stock < item.quantity)
        throw new HttpError(
          409,
          "{product} 库存不足，当前剩余 {stock} {unit}。",
          { product: product.name, stock: product.stock, unit: product.unit },
        );
      if (
        marketId &&
        (marketId !== product.market_id || retailerId !== product.retailer_id)
      )
        throw new HttpError(400, "每笔订单仅支持同一市场、同一商户的商品。");
      marketId = product.market_id;
      retailerId = product.retailer_id;
      total += product.price_cents * item.quantity;
      return { ...product, quantity: item.quantity };
    });
    const id = `QH-${randomUUID().slice(0, 8).toUpperCase()}`;
    db.prepare(
      "INSERT INTO orders (id,client_id,market_id,total_cents,pickup_date,pickup_slot,note,payment_method) VALUES (?,?,?,?,?,?,?,?)",
    ).run(
      id,
      user.id,
      marketId,
      total,
      marketDay(),
      input.pickupSlot,
      input.note,
      input.paymentMethod,
    );
    const insert = db.prepare("INSERT INTO order_items VALUES (?,?,?,?,?,?,?)");
    for (const item of items) {
      db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(
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
    db.exec("COMMIT");
    return getOrders(db, user).find((order) => order.id === id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateOrderStatus(db, user, id, status) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    if (!order) throw new HttpError(404, "订单不存在。");
    const items = db
      .prepare("SELECT * FROM order_items WHERE order_id=?")
      .all(id);
    const owns =
      user.role === "retailer"
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
    db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, id);
    if (status === "cancelled")
      for (const item of items)
        db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(
          item.quantity,
          item.product_id,
        );
    db.exec("COMMIT");
    return getOrders(db, user).find((o) => o.id === id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
