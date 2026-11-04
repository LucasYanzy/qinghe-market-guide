import { commonEnglish } from "./common.ts";

// Only these generated records are UI demo content. Real names and notes stay unchanged.
export const previewRecordEnglish: Record<string, string> = {
  "合成统计演示，无真实购买或支付。": "Synthetic analytics demo; no actual purchase or payment.",
};
for (let index = 1; index <= 48; index++) {
  const number = String(index).padStart(2, "0");
  previewRecordEnglish[`统计样本顾客 ${number}`] = `Analytics sample customer ${number}`;
}

export function translatePreviewContent(text: string, translate: (text: string) => string): string {
  return Object.hasOwn(previewRecordEnglish, text) ? translate(text) : text;
}

// Translate only known labels from the shipped school preview seed.
// Unrecognized vendor and customer content still keeps its original text.
export const previewEnglish: Record<string, string> = {
  ...previewRecordEnglish,
  "College Avenue · 演示市场": "College Avenue · Demo market",
  "Busch · 演示市场": "Busch · Demo market",
  "Livingston · 演示市场": "Livingston · Demo market",
  "校园收获 · 演示商户": "Campus Harvest · Demo vendor",
  "邻里菜园 · 演示商户": "Neighborhood Garden · Demo vendor",
  "多市场管理演示": "Multiple-market management demo",
  "演示时段 10:00–16:00 ET；非官方营业安排": "Demo hours: 10:00–16:00 ET; not an official schedule",
  "仅用于多市场功能演示。坐标与服务范围为演示设置，不代表已核实运营地点或覆盖区域。": "For demonstrating multiple-market features. Coordinates and service areas are sample settings, not verified operating locations or coverage.",
  "多市场流程演示商品，不代表真实供应或报价。": "A sample product for the multiple-market demo, not a real offer or confirmed availability.",
  "合成演示：展示现场 EBT 办理流程，不代表真实市场授权或接受。": "Synthetic demo: illustrates an on-site EBT process; it does not confirm market authorization or acceptance.",
  "合成演示：示例参与记录，无真实商户授权。": "Synthetic demo: sample participation record; no actual vendor authorization.",
};
for (const name of ["藤熟番茄", "田园西兰花", "彩虹胡萝卜", "奶油生菜", "秋收小南瓜", "迷你黄瓜", "农场土豆", "紫皮洋葱", "新鲜西兰花", "有机胡萝卜", "甜栗南瓜", "爽脆黄瓜", "田园土豆"]) {
  previewEnglish[`${name} · 校园演示`] = `${commonEnglish[name]} · Campus demo`;
}
