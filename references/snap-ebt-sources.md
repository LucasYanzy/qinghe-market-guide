# SNAP / EBT 购买流程与资料依据

人工核对日期：2026-10-29。适用于本项目的演示预购和现场付款说明，不证明任何 Rutgers 地点、市场或商户已经接受 SNAP。

| 官方来源 | 核对用途 |
| --- | --- |
| https://www.fns.usda.gov/snap/eligible-food-items | 家庭食用食品、食物种子和植物；热食、补充剂、非食品等排除项 |
| https://www.fns.usda.gov/snap/farmer-producer | 市场/农场参与授权、EBT 设备、服务商与代币/scrip 模式 |
| https://www.fns.usda.gov/snap/farmers-markets-accepting-benefits | 使用官方查询器的 Farmers and Markets 分类查找参与地点 |
| https://www.fns.usda.gov/snap/retailer-locator | 官方接受地点查询入口 |
| https://www.nj.gov/humanservices/njsnap/recipients/benefits | NJ Families First EBT、PIN 保护、SNAP 食品福利与现金福利区分 |
| https://www.fns.usda.gov/snap/online | 在线 EBT 的额外授权/技术接入；配送、服务和便利费用不能由 SNAP 支付 |

## 数据与流程

- 市场接受状态、现场办理方式、核实日期与公开依据分别保存；接受必须有过去或当天的有效日期、非空依据和明确的办理方式。
- 商户参与状态按“市场 × 商户”保存。同一商户在一个市场参与，不自动扩展至其他市场。保留入驻关系的修改保留核实记录；退出再加入默认为未确认。
- 商品资格只有 `eligible` / `ineligible` / `unknown`。不按名称或蔬菜分类自动推定，未核实项不计入 SNAP 食品预估。
- 服务端重新读取价格、库存、市场预购状态、入驻关系与接受政策。混合购物袋的未确认/不适用商品计入其他方式预估。每单仍限同市场、同商户。
- 接受状态和商品资格满足后，顾客可以提交“现场 SNAP/EBT 付款意向”。订单保存提交时的金额、逐项资格、现场办理方式、核实日期和公开指引快照。后续商品或政策变化不改写历史快照。
- 市场服务台模式指到场通过 EBT 办理 SNAP 专用代币，再到参与摊位购买；商户终端模式指参与商户现场处理 EBT。实际流程由运营方核实。
- 不请求卡号、PIN、福利余额；不验证个人 SNAP 领取资格；不处理在线 EBT、代币发放、返还、退款或核销。备注提示不填写卡号和 PIN。
- 不承诺余额足以支付食品预估，余额不足由现场使用其他方式补足；不设默认优惠倍增额度。Market Bucks、SNAP 食品福利、EBT 现金福利分别说明。
- 学校统计的是非取消的意向订单，不作为真实核销次数、福利金额或食品援助成效；订单完成仅表示自提履约。

资料随版本人工更新。配送费等当前尚未实现；后续接入时应单独计价，不得计入 SNAP 食品金额。在线 EBT 需要另行完成官方批准的零售商与加密 PIN/支付提供商接入，不能将普通线上支付表单直接改称 EBT。
