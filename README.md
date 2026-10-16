# 青禾 · Rutgers 社区农夫市集

一个可运行的全栈雏形，用来逐步确认顾客端（Client）与商户端（Retailer）的产品流程。当前使用演示市场、示例蔬菜和生成的历史价格，不代表 Rutgers 官方的商品、报价或营业安排。

## 本轮范围

- 顾客端：当日蔬菜、搜索与分类、购物袋、预购自提、订单状态与待确认订单取消。
- 市场页：地址展示、Google Maps / Apple Maps 导航链接。
- 商户端：经营概览、商品上架与编辑、价格和库存调整、确认预购与自提。
- 价格观察：历史记录、7 天线性趋势预测及误差说明。
- 基础邮箱登录、顾客注册、服务端角色校验，SQLite 持久化。

预购采用**到场付款**，尚未接入线上支付、短信、真实农场数据或生产运营系统。当前适合本地评审与迭代，不是生产上线版本。

## Rutgers 官方资料来源

项目指定参考页面：[Rutgers Farmers Market](https://ruoffcampus.rutgers.edu/basic-needs/food-assistance/rutgers-farmers-market)。市场页已提供直达入口，并将现有地址、导航路线及自提时段明确标为演示。

**待完成官网核验**：当前云环境访问该页面时，HTTPS 代理返回 `403 Forbidden`，尚未读取网页正文。因此本轮没有把示例地址或时段改写成所谓的官方安排，也没有假设官网支持线上预购、线上付款或特定食品援助支付方式。需要恢复该域名访问，或由项目负责人提供页面原文后，才能准确同步市场地址、开放日期、营业时间和相关政策。

### Externship 采价参考

价格观察默认展示 `references/externship-market-prices.json` 中的 30 项市场历史采价资料。数据从 Externship 项目的既有研究记录恢复，来源为 `Externship_Weee_Amazon_Consolidated_01.xlsx` 及九张现场照片的核价结果；当前云端未直接打开桌面原始工作簿或照片。

保留了已记录的修正：芒果为 $2/个；樱桃辣椒的 $2 each 不足以确认按颗还是按篮；樱桃红萝卜为新增记录，$2/篮的单位部分遮挡、依据陈列推断。盒、袋、篮装商品没有净重时，不换算每磅价格。牛油果、橙子及黄瓜的多件优惠保留原始条件，不用优惠价冒充单件售价。

复核记录日期为 2026-10-15，**实际市场采价日期未知**。这些资料不用于当前下单、不进入人工生成的 28 天价格序列，也不用于预测。演示趋势在单独标签页中展示。

## 本地启动

需要 **Node.js 24+**（使用内置 `node:sqlite`）。

```bash
cd /workspace/Rutgers-Community-Farmers-Market
npm ci
npm run dev
```

前端端口 `5173`，API 端口 `3001`。Vite 将 `/api` 请求代理给后端，不需要额外配置 CORS。

首次启动自动创建 `data/market.sqlite`，初始化当天演示商品与最近 28 天的示例历史价格。页面中的演示入口可以登录两种角色：

| 角色 | 邮箱                   | 演示密码          |
| ---- | ---------------------- | ----------------- |
| 顾客 | `client@qinghe.demo`   | `MarketDemo2026!` |
| 商户 | `retailer@qinghe.demo` | `MarketDemo2026!` |

演示密码是公开的测试凭据，请勿用于真实账号。示例数据库及环境文件已加入 `.gitignore`。

### 验证

```bash
npm run check
```

包含 TypeScript 检查、前端构建与 API 集成测试。测试使用独立临时数据库，覆盖权限、订单履约、库存扣减与归还、越权操作、商品编辑、价格预测和持久化。

浏览器交互回归测试使用 Playwright 和独立临时数据库，不修改开发数据库：

```bash
npx playwright install chromium
npm run test:ui
```

如环境已安装 Chromium，可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:ui`。
测试覆盖登录后继续预购、取消登录后返回购物袋、提交等待与失败重试、库存变化、弹窗键盘操作及手机布局；测试服务使用本机 `3101` 端口。

购物袋的自提时段和备注会在当前页面会话内保留，关闭购物袋或进入登录弹窗不会丢失；刷新页面后不保留。预购成功、退出登录或切换账号后清空。顾客登录后仍需确认预购，不会自动创建订单。提交请求时会锁定表单和弹窗关闭操作，失败后恢复操作并保留输入。

构建后可由单个进程提供静态页面与 API：

```bash
npm run build
npm start
```

## 结构

```text
src/                  React + TypeScript 界面
server/app.mjs        Express HTTP API、会话与输入校验
server/services.mjs   预购、库存事务和订单状态流转
server/db.mjs         SQLite 表结构与演示数据
server/forecast.mjs   基于实际日期的线性回归与滚动回测
tests/                API 集成测试
```

业务逻辑层负责服务端定价、库存事务和订单状态校验，前端不直接访问数据库。金额统一存为整数美分；业务日期统一为 `America/New_York`。

## 主要接口

| 接口                                         | 作用                     | 权限              |
| -------------------------------------------- | ------------------------ | ----------------- |
| `GET /api/config`、`GET /api/health`         | 运行配置与健康状态       | 公开              |
| `GET /api/markets`、`GET /api/products`      | 市场、当日商品及筛选     | 公开              |
| `GET /api/products/:id/prices`               | 历史价格与预测           | 公开              |
| `POST /api/auth/login`、`register`、`logout` | 账号与会话               | 对应账号          |
| `GET /api/auth/me`                           | 当前账号                 | 公开，可返回 null |
| `GET /api/orders`                            | 本人或所属商户订单       | 登录              |
| `POST /api/orders`                           | 按服务端价格预购、扣库存 | 顾客              |
| `PATCH /api/orders/:id/status`               | 取消、确认、完成         | 所属顾客 / 商户   |
| `GET /api/retailer/dashboard`                | 经营概览                 | 商户              |
| `GET/POST /api/retailer/products`            | 库存列表 / 新建商品      | 商户              |
| `PUT /api/retailer/products/:id`             | 编辑所属商品             | 商户              |

订单流转：`pending → confirmed → completed`，待确认或待自提订单可由商户取消；顾客只能取消自己的待确认订单。取消会在同一事务中归还库存。重复取消不会重复归还。

## 配置与雏形边界

见 `.env.example`。启动前通过 shell 导出配置；程序不会自动读取 `.env`。

- `DATABASE_PATH`：SQLite 路径，默认 `./data/market.sqlite`。
- `PORT` / `HOST`：API 默认 `3001` / `0.0.0.0`；开发前端代理目前指向 `3001`。
- `DEMO_MODE`：默认开启。关闭时必须使用全新数据库；开关不会删除已有演示账号或历史数据。
- `COOKIE_SECURE`：HTTPS 部署时设为 `true`。

演示商品只在首次初始化时绑定当日日期，跨日不会自动重新上架。可在商户端把售卖日期更新为当天；历史记录随商户调价写入，不会自动伪造后续交易。

预测用最近最多 28 条历史记录按日期做线性回归，至少需要 7 条记录。误差来自最后最多 7 个时点的滚动单步回测；估计区间来自残差，不是价格保证，不考虑天气或供需。首版每笔订单限定同一市场、同一商户；称重商品最终金额需线下确认。自提时段固定为演示时段，尚未实现真实营业日、截止时间与容量控制。

后续可以按反馈分步完善真实市场配置、商品图片、多商户拆单、自提规则和更完整的账号体系。正式上线前还需要独立处理账号恢复、商户准入、部署监控与支付等需求。

## 交付方式

所有源代码变更放在功能分支，通过 PR 审核；不直接推送到 `main`。空仓库需要先存在基础分支，才能在 GitHub 创建 PR。未获授权时不替用户创建远程基础分支。
