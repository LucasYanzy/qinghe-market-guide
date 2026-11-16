# 青禾 · Rutgers 市集内部运营

[公开看板](https://lucasyanzy.github.io/qinghe-market-guide/) · [使用说明](operations/README.md) · [源码](https://github.com/LucasYanzy/qinghe-market-guide)

记录每场销售与支付构成、库存及损耗，导入/导出 Excel，比较点位贡献与交叉补贴情景。英文默认，可切换中文。非 Rutgers 官方网站。

## 直接使用

打开 **https://lucasyanzy.github.io/qinghe-market-guide/** 即可使用，无需启动本地服务。

- **Example**：独立保存的合成示例，用于了解看板。
- **My records**：初始为空，可以录入真实记录或导入已有表格。记录仅保存在当前浏览器，不上传到 GitHub，也不在人员或设备之间自动同步。
- 在 **Import & export** 导出 Excel 或 JSON 备份。清理浏览器、换电脑前先导出，之后可以重新导入。

公开网页及源码不包含真实经营记录。市场经理最终原始表格可通过列名映射导入。

## 本地数据库版本

需要 Node.js 24+：

```sh
cd operations
npm ci
npm run dev
# http://127.0.0.1:5186
```

本地版本把真实记录保存在本机 SQLite 数据库，与公开版浏览器记录分开。完整字段定义、库存校验、导入规则和运行说明见 [operations/README.md](operations/README.md)。

## 发布与检查

`.github/workflows/pages.yml` 在 `main` 更新后，检查并发布 `operations/dist-public` 到原网站首页。公开构建使用浏览器存储，不请求本地 API。

```sh
cd operations
npm run check
npm run test:ui
npm run test:public
```

## 旧版存档

原顾客 / 商户 / 学校完整平台的线上源码和含未提交改动的本地源码，已存入私有历史库 [Rutgers-Community-Farmers-Market](https://github.com/LucasYanzy/Rutgers-Community-Farmers-Market)，标签分别为：

- `archive/pre-internal-2026-11-16/production`
- `archive/pre-internal-2026-11-16/working-copy`

原始工作目录和 Git 历史保留。仓库根目录的旧平台源码属于历史实现，当前公开首页由 `operations/` 提供。
