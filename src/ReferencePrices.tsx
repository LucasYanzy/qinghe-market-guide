import { useLanguage } from "./i18n";
import { useState } from "react";
import { BookOpen, FileText, Search } from "lucide-react";
import archive from "../references/externship-market-prices.json";
import { money } from "./api";

export default function ReferencePrices() {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
  const visible = archive.items.filter((item) =>
    `${item.name} ${item.english_name}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <section className="reference-prices">
      <div className="reference-intro panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{t("EXTERNSHIP · FIELD RESEARCH ARCHIVE")}</span>
            <h2>
              <BookOpen size={20} />{t("市场历史采价档案")}</h2>
          </div>
          <span className="status-badge status-pending">{t("历史资料 · 非实时报价")}</span>
        </div>
        <p>{t("来自 Externship 项目的市场价格整理及 9 张现场照片核价记录，共 {count} 项商品。保留价签原始单位、优惠条件与核验限制。", { count: archive.items.length })}</p>
        <div className="reference-source-meta">
          <span>
            <FileText size={14} />{t("复核记录日：")}{t(archive.review_record_date)}
          </span>
          <span>{t("实际采价日期：未记录")}</span>
          <span>{t("报价币种：USD")}</span>
        </div>
        <ul>
          {archive.limitations.map((note) => (
            <li key={note}>{t(note)}</li>
          ))}
        </ul>
        <p className="helper-text">{t("资料恢复方式：")}{t(archive.retrieval_note)}</p>
      </div>
      <div className="reference-toolbar">
        <span>{t("显示 {count} / {total} 项", { count: visible.length, total: archive.items.length })}</span>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t("搜索历史采价商品")}
            placeholder={t("搜索中文或英文商品名…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="panel reference-table">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("商品")}</th>
                <th>{t("价签价格")}</th>
                <th>{t("原始计价单位")}</th>
                <th>{t("多件优惠")}</th>
                <th>{t("核价说明")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{language === "en" ? item.english_name : item.name}</strong>
                    <small className="reference-english" lang={language === "en" ? "zh-CN" : "en"}>
                      {language === "en" ? item.name : item.english_name}
                    </small>
                  </td>
                  <td>
                    <strong>{t(money(item.listed_price_cents))}</strong>
                  </td>
                  <td>{t(item.unit)}</td>
                  <td>{item.offer ? t(item.offer) : t("未记录")}</td>
                  <td className="reference-note">{t(item.note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p className="reference-empty">{t("没有匹配的历史记录，请尝试其他关键词。")}</p>
        )}
      </div>
      <p className="helper-text reference-file-source">{t("来源工作簿：Externship_Weee_Amazon_Consolidated_01.xlsx。历史采价档案与演示商品、库存和预测数据独立，不影响现有订单。")}</p>
    </section>
  );
}
