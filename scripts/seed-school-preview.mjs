// Populate the separate local school preview, without fabricating any orders or participants.
import { openDatabase, hashPassword, marketDay } from "../server/db.mjs";
const db = openDatabase(process.argv[2] ?? "./data/school-admin-preview.sqlite");
try {
  db.exec("BEGIN IMMEDIATE");
  const samples = [
    { name: "College Avenue · 演示市场", community: "College Avenue", address: "126 College Ave, New Brunswick, NJ", latitude: 40.502, longitude: -74.452, radius: 1.5 },
    { name: "Busch · 演示市场", community: "Busch Campus", address: "604 Bartholomew Rd, Piscataway, NJ", latitude: 40.523, longitude: -74.458, radius: 2 },
    { name: "Livingston · 演示市场", community: "Livingston Campus", address: "Livingston Campus, Piscataway, NJ", latitude: 40.523, longitude: -74.436, radius: 1.3 },
  ];
  const vendors = [
    { email: "retailer@qinghe.demo", name: "Green Acre 农场" },
    { email: "busch-vendor@qinghe.demo", name: "校园收获 · 演示商户" },
    { email: "livingston-vendor@qinghe.demo", name: "邻里菜园 · 演示商户" },
  ].map((vendor) => {
    let found = db.prepare("SELECT id FROM users WHERE email=?").get(vendor.email);
    if (!found) found = { id: Number(db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'retailer')").run(vendor.email, vendor.name, hashPassword("MarketDemo2026!")).lastInsertRowid) };
    return { ...vendor, id: found.id };
  });
  const sources = db.prepare("SELECT * FROM products WHERE market_id=1 ORDER BY id LIMIT 2").all();
  for (const [i, sample] of samples.entries()) {
    let market = db.prepare("SELECT id FROM markets WHERE name=?").get(sample.name);
    if (!market) market = { id: Number(db.prepare(`INSERT INTO markets
      (name,subtitle,address,latitude,longitude,hours,description,community,coverage_radius_km,active,preorders_enabled)
      VALUES (?,?,?,?,?,?,?,?,?,1,1)`).run(sample.name, "多市场管理演示", sample.address, sample.latitude, sample.longitude,
      "演示时段 10:00–16:00 ET；非官方营业安排", "仅用于多市场功能演示。坐标与服务范围为演示设置，不代表已核实运营地点或覆盖区域。",
      sample.community, sample.radius).lastInsertRowid) };
    const vendor = vendors[i];
    db.prepare("INSERT OR IGNORE INTO market_vendors (market_id,retailer_id) VALUES (?,?)").run(market.id, vendor.id);
    for (const source of sources) {
      const name = `${source.name} · 校园演示`;
      if (db.prepare("SELECT id FROM products WHERE market_id=? AND retailer_id=? AND name=?").get(market.id, vendor.id, name)) continue;
      db.prepare(`INSERT INTO products (market_id,retailer_id,name,category,art,unit,price_cents,stock,farm,description,organic,available_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(market.id, vendor.id, name, source.category, source.art, source.unit, source.price_cents, 20,
        vendor.name, "多市场流程演示商品，不代表真实供应或报价。", source.organic, marketDay());
    }
  }
  db.prepare("INSERT OR IGNORE INTO market_vendors (market_id,retailer_id) VALUES (?,?)").run(db.prepare("SELECT id FROM markets WHERE name=?").get(samples[0].name).id, vendors[2].id);
  db.exec("COMMIT");
  console.log("School preview ready: campus demo markets and vendors added; order history unchanged.");
} catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; } finally { db.close(); }
