// Explicitly synthetic presentation data. No records are loaded from an operational database.
export const demoProducts = [
  { id: 1, zh: "藤熟番茄", en: "Vine-ripened tomatoes", art: "tomato", price: 350, stock: 24, unitZh: "磅", unitEn: "lb", category: "fruit" },
  { id: 2, zh: "彩虹胡萝卜", en: "Rainbow carrots", art: "carrot", price: 250, stock: 18, unitZh: "把", unitEn: "bunch", category: "root" },
  { id: 3, zh: "鲜嫩生菜", en: "Fresh lettuce", art: "lettuce", price: 220, stock: 8, unitZh: "颗", unitEn: "head", category: "leaf" },
  { id: 4, zh: "当季西兰花", en: "Seasonal broccoli", art: "broccoli", price: 420, stock: 16, unitZh: "磅", unitEn: "lb", category: "leaf" },
];
export const demoMarkets = [
  { id: 1, zh: "校园示例市场", en: "Campus sample market", vendors: 2, session: "11:00–14:00" },
  { id: 2, zh: "社区示例市场", en: "Community sample market", vendors: 1, session: "09:00–13:00" },
  { id: 3, zh: "花园示例市场", en: "Garden sample market", vendors: 1, session: "11:00–15:00" },
];
export const demoOrders = [
  { id: "DEMO-001", marketId: 1, customer: "A", total: 1800, status: "completed", slot: "11:00–11:30", detailZh: "番茄与胡萝卜", detailEn: "Tomatoes and carrots" },
  { id: "DEMO-002", marketId: 1, customer: "B", total: 1250, status: "completed", slot: "11:30–12:00", detailZh: "生菜与西兰花", detailEn: "Lettuce and broccoli" },
  { id: "DEMO-003", marketId: 2, customer: "C", total: 1500, status: "confirmed", slot: "10:00–10:30", detailZh: "当季蔬菜组合", detailEn: "Seasonal vegetable selection" },
  { id: "DEMO-004", marketId: 1, customer: "D", total: 950, status: "pending", slot: "12:00–12:30", detailZh: "番茄与生菜", detailEn: "Tomatoes and lettuce" },
  { id: "DEMO-005", marketId: 2, customer: "E", total: 1450, status: "completed", slot: "11:00–11:30", detailZh: "胡萝卜与西兰花", detailEn: "Carrots and broccoli" },
  { id: "DEMO-006", marketId: 3, customer: "F", total: 600, status: "cancelled", slot: "13:00–13:30", detailZh: "示例取消订单", detailEn: "Sample cancelled order" },
] as const;
