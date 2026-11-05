import archive from "../references/externship-market-prices.json" with { type: "json" };

// Product identities follow the 30 verified field-research records. Prices,
// packaging and stock below are explicit demo assumptions, not live offers.
// Inferred historical units are left untouched in the research archive.
const listings = [
  [1, "农场特产", "honey", "瓶", 1500, 16, "一匙温润蜜香，拌进酸奶、温茶或早餐燕麦。"],
  [2, "根茎类", "ginger", "块", 100, 30, "辛香清亮，切几片煮茶，也为汤羹添一份暖意。"],
  [3, "根茎类", "garlic", "头", 100, 40, "一瓣提香，慢烤后柔软甘甜，适合日常炖煮。"],
  [4, "新鲜水果", "banana", "盒", 200, 20, "绵软香甜，早餐配燕麦，熟透后烤一份香蕉面包。"],
  [5, "新鲜水果", "avocado", "个", 200, 28, "细腻柔滑，切片铺吐司，或拌一碗清爽沙拉。"],
  [6, "新鲜水果", "mango", "个", 200, 22, "金黄果肉，香气浓郁，切块即食或打成冰沙。"],
  [7, "新鲜水果", "orange", "个", 75, 48, "剥开一份明亮的酸甜，鲜食、榨汁都清爽。"],
  [8, "新鲜水果", "citrus", "个", 50, 50, "一抹果香点亮沙拉、烤蔬菜与清凉饮品。"],
  [9, "新鲜水果", "peach", "盒", 400, 16, "柔软多汁，切片搭酸奶，也适合烤成果香甜点。"],
  [10, "新鲜水果", "plum", "盒", 400, 18, "紫红果皮包着酸甜，洗净即食，或熬一小罐果酱。"],
  [11, "新鲜水果", "pear", "盒", 400, 20, "清甜细润，鲜食爽口，慢炖后是一碗温柔甜汤。"],
  [12, "新鲜水果", "apple", "盒", 400, 24, "清脆果香，随手带一颗，也可烤成暖暖的苹果派。"],
  [13, "新鲜水果", "grapes", "袋", 500, 18, "一串酸甜小果，冷藏后更爽口，适合分享。"],
  [14, "果实类", "tomato", "盒", 400, 24, "饱满多汁，切片做沙拉，慢煮成一锅浓郁番茄酱。"],
  [15, "果实类", "cherry-pepper", "盒", 200, 18, "小巧圆润，辛辣鲜明，腌渍或切碎为料理提味。"],
  [16, "果实类", "jalapeno", "盒", 200, 20, "青绿椒香带着辣意，切圈搭配玉米饼或自制莎莎酱。"],
  [17, "果实类", "bell-pepper", "个", 100, 32, "红亮脆甜，生吃清爽，烘烤后更显柔甜。"],
  [18, "果实类", "zucchini", "个", 100, 28, "细嫩清甜，快炒、烘烤，或削成轻盈的蔬菜面。"],
  [19, "果实类", "cucumber", "个", 75, 36, "清脆多汁，拍拌、切片，给日常餐桌添一口清新。"],
  [20, "果实类", "spaghetti-squash", "个", 300, 16, "烤熟后轻轻一拨，金黄瓜肉散成细丝，拌酱就好吃。"],
  [21, "果实类", "acorn-squash", "个", 200, 18, "深绿瓜皮、橙黄果肉，对半烘烤，盛满秋日暖香。"],
  [22, "果实类", "butternut", "个", 300, 20, "柔滑甘甜，烘烤或打成浓汤，让一餐变得温暖。"],
  [23, "叶菜类", "cabbage", "颗", 300, 24, "层层紧实，清炒脆甜，慢炖后柔软入味。"],
  [24, "果实类", "beans", "盒", 300, 22, "翠绿豆荚，焯熟再快炒，保留一口爽脆。"],
  [25, "根茎类", "beet", "篮", 300, 18, "深红根肉，烤后甜润，切块拌进沙拉。"],
  [26, "根茎类", "sweet-potato", "盒", 300, 26, "慢烤出绵密甜香，蒸煮也能吃到朴实好味。"],
  [27, "根茎类", "potato", "盒", 300, 30, "黄白相间的家常滋味，捣泥、炖汤或烤成金黄小块。"],
  [28, "根茎类", "red-potato", "盒", 300, 24, "薄薄红皮，口感细润，带皮烘烤或做温热土豆沙拉。"],
  [29, "根茎类", "onion", "个", 100, 36, "红黄洋葱各有风味，快炒提香，慢煮释放甜味。"],
  [30, "根茎类", "radish", "篮", 200, 20, "红皮白心，脆嫩微辛，薄切拌沙拉或腌成爽口小菜。"],
];

export const researchDemoProducts = listings.map(([referenceId, category, art, unit, price, stock, description]) => ({
  referenceId, name: archive.items.find((item) => item.id === referenceId).name,
  category, art, unit, price, stock, description,
}));

export function addResearchDemoProducts(db, today) {
  const key = "demo-research-catalog-v1";
  if (db.prepare("SELECT 1 FROM app_metadata WHERE key=?").get(key)) return;
  // Extend only the seeded vendor's existing market access.
  const vendor = db.prepare(`SELECT u.id,u.name FROM users u JOIN market_vendors v ON v.retailer_id=u.id
    WHERE u.email='retailer@qinghe.demo' AND v.market_id=1`).get();
  if (!vendor) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT id FROM products WHERE market_id=1 AND retailer_id=? AND name=?");
    const insert = db.prepare(`INSERT INTO products
      (market_id,retailer_id,name,category,art,unit,price_cents,stock,farm,description,organic,available_date)
      VALUES (1,?,?,?,?,?,?,?,?,?,0,?)`);
    for (const p of researchDemoProducts) {
      if (existing.get(vendor.id, p.name)) continue;
      const result = insert.run(vendor.id, p.name, p.category, p.art, p.unit, p.price, p.stock, vendor.name, p.description, today);
      // One demo observation; never turn the undated archive into a price trend.
      db.prepare("INSERT INTO price_history VALUES (?,?,?)").run(result.lastInsertRowid, today, p.price);
    }
    db.prepare("INSERT INTO app_metadata (key,value) VALUES (?,?)").run(key, today);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
