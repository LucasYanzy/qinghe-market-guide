import { workflowEnglish } from "./workflows.ts";
import { screenEnglish } from "./screen.ts";
import { operationsEnglish } from "./operations.ts";
import { previewEnglish } from "./preview.ts";
import { commonEnglish } from "./common.ts";
import { schoolEnglish } from "./school.ts";
import { marketEnglish } from "./market.ts";
import { simpleEnglish } from "./simple.ts";

import { releaseEnglish } from "./release.ts";

import { continuityEnglish } from "./continuity.ts";
import { reportsEnglish } from "./reports.ts";
import { analyticsEnglish } from "./analytics.ts";

export const english: Record<string, string> = {
  ...reportsEnglish,
  "商品或自提信息已更新，请重新确认预购。": "Your items or pickup details changed. Please review your preorder again.",
  "提交前确认预购": "Review your preorder before submitting",
  "这是一笔预购。提交后会预留库存，请等待商户确认，再按约定时段到场自提并付款。": "This is a preorder. Submitting reserves stock. Wait for vendor confirmation, then collect and pay during your pickup window.",
  "本次预购商品": "Items in this preorder",
  "自提时间": "Pickup time",
  "付款偏好": "Payment preference",
  "SNAP/EBT（到场确认）": "SNAP/EBT (confirm at pickup)",
  "SNAP/EBT 是否接受及商品资格，请提前与商户确认。": "Confirm SNAP/EBT acceptance and eligible items with the vendor before pickup.",
  "此处不会收取线上款项；称重商品的最终数量与金额以到场确认为准。": "No payment is taken online. Confirm the final quantity and amount for weighed items at pickup.",
  "返回修改": "Back to edit",
  "确认并提交预购": "Confirm and submit preorder",
  "到场付款偏好": "Payment preference at pickup",
  "到场确认": "Confirm at pickup",
  "常规到场付款": "Standard payment at pickup",
  "已选择 SNAP/EBT，请到场确认是否可用。": "SNAP/EBT selected. Confirm availability at pickup.",
  "使用商户现场接受的付款方式。": "Use a payment method the vendor accepts at pickup.",
  "切换付款偏好": "Switch payment preference",
  "长按切换，轻点查看付款选项": "Hold to switch, or click to see payment options",
  "继续按住片刻完成切换，提前松开可取消。": "Keep holding briefly to switch. Release early to cancel.",
  "长按 ＋ 切回常规付款，轻点查看选项。": "Hold + to return to standard payment, or click to see options.",
  "长按 ＋ 切换至 SNAP/EBT，轻点查看选项。": "Hold + to switch to SNAP/EBT, or click to see options.",
  "也可以直接选择": "You can also choose directly",
  "SNAP/EBT 是食品补助付款方式。是否接受及商品资格需向商户确认；此处只记录偏好，不收取线上款项、EBT 卡号或 PIN。": "SNAP benefits are paid using an EBT card. Confirm acceptance and eligible items with the vendor. This only records your preference; no online payment, EBT card number, or PIN is collected.",
  "付款偏好：SNAP/EBT。请与商户确认是否接受及商品资格，到场完成付款。": "Payment preference: SNAP/EBT. Confirm acceptance and eligible items with the vendor, then pay at pickup.",
  "鼠标长按 + / − 可连续调整": "Hold + / − with your mouse to adjust continuously",
  "按住可连续增加": "Hold to keep adding",
  "按住可连续减少": "Hold to keep reducing",
  "已达上限 {count} {unit}": "Limit reached: {count} {unit}",
  ...continuityEnglish,
  ...releaseEnglish,
  ...workflowEnglish,
  ...commonEnglish,
  ...screenEnglish,
  ...operationsEnglish,
  ...previewEnglish,
  ...schoolEnglish,
  ...marketEnglish,
  ...simpleEnglish,
  ...analyticsEnglish,
};
