import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, marketDay } from "../server/db.mjs";
import { placeOrder } from "../server/services.mjs";
import { researchDemoProducts } from "../server/demo-catalog.mjs";
import archive from "../references/externship-market-prices.json" with { type: "json" };
import options from "../references/catalog-options.json" with { type: "json" };

test("the expanded demo covers all researched products with supported categories and packaging", () => {
  const db = openDatabase(":memory:");
  try {
    const products = db.prepare("SELECT * FROM products ORDER BY id").all();
    assert.equal(products.length, 38);
    assert.equal(products[0].name, "藤熟番茄");
    assert.equal(products[7].name, "紫皮洋葱");
    for (const item of archive.items) {
      const p = products.find((p) => p.name === item.name);
      assert.ok(p, item.name);
      assert.ok(options.categories.includes(p.category));
      assert.ok(options.units.includes(p.unit));
      assert.ok(Object.hasOwn(options.artLabels, p.art));
      assert.equal(p.available_date, marketDay());
      assert.equal(p.organic, 0);
      assert.equal(p.snap_eligibility, "unknown");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM price_history WHERE product_id=?").get(p.id).n, 1);
    }
    assert.equal(products.filter((p) => p.category === "新鲜水果").length, 10);
    assert.equal(products.find((p) => p.name === "本地蜂蜜").unit, "瓶");
    assert.equal(products.find((p) => p.name === "香蕉").unit, "盒");
    assert.equal(products.find((p) => p.name === "樱桃红萝卜").unit, "篮");
  } finally { db.close(); }
});

test("legacy demos gain the research catalog once while keeping orders, edits and removed listings", () => {
  const directory = mkdtempSync(join(tmpdir(), "qinghe-catalog-"));
  const path = join(directory, "market.sqlite");
  let db;
  try {
    db = openDatabase(path);
    db.exec("DELETE FROM price_history WHERE product_id>8; DELETE FROM products WHERE id>8; DELETE FROM app_metadata WHERE key='demo-research-catalog-v1'");
    const order = placeOrder(db, { id: 1, role: "client" }, { items: [{ productId: 1, quantity: 2 }], pickupSlot: "10:00–12:00", note: "Keep this order" });
    db.prepare("UPDATE products SET price_cents=499 WHERE id=1").run();
    db.close();
    db = openDatabase(path);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products").get().n, 38);
    assert.equal(db.prepare("SELECT stock FROM products WHERE id=1").get().stock, 34);
    assert.equal(db.prepare("SELECT price_cents FROM products WHERE id=1").get().price_cents, 499);
    assert.equal(db.prepare("SELECT note FROM orders WHERE id=?").get(order.id).note, "Keep this order");
    const honey = db.prepare("SELECT id FROM products WHERE name='本地蜂蜜'").get();
    db.prepare("UPDATE products SET stock=2,price_cents=1700,active=0 WHERE id=?").run(honey.id);
    db.prepare("DELETE FROM price_history WHERE product_id=(SELECT id FROM products WHERE name='香蕉')").run();
    db.prepare("DELETE FROM products WHERE name='香蕉'").run();
    db.close();
    db = openDatabase(path);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products").get().n, 37);
    assert.deepEqual({ ...db.prepare("SELECT stock,price_cents,active FROM products WHERE id=?").get(honey.id) }, { stock: 2, price_cents: 1700, active: 0 });
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("production databases receive no demo products", () => {
  const db = openDatabase(":memory:", { demo: false });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
    assert.equal(researchDemoProducts.length, archive.items.length);
  } finally { db.close(); }
});
