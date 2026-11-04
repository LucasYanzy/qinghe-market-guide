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

export const english: Record<string, string> = {
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
};
