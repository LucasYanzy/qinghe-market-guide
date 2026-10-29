import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  Leaf,
  LoaderCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Sprout,
  X,
} from "lucide-react";
import { api, money } from "./api";
import { quantityUnit } from "./translations/translate";
import { useLanguage, type Message } from "./i18n";
import { Produce } from "./Produce";
import { Empty, Modal } from "./ui";
import {
  VendorError,
  VendorRefresh,
  VendorFilterChips,
} from "./VendorWorkspace";
import {
  inventoryMatches,
  useVendorData,
  useVendorFilters,
  type InventoryFilter,
} from "./vendorSupport";
import type { Product } from "./types";
import { InventoryBulkActions } from "./VendorBulkActions";
import { VendorDataFeedback, VendorLoading } from "./VendorDataFeedback";

const inventoryFilters: [InventoryFilter, string][] = [
  ["all", "全部商品"],
  ["today", "今日展示"],
  ["low", "库存偏低"],
  ["out", "已售罄"],
  ["off-date", "非今日售卖"],
  ["hidden", "已下架"],
];
const inventoryDefaults = {
  status: "all",
  search: "",
  category: "",
  sort: "default",
  page: "1",
};
const categories = ["叶菜类", "根茎类", "果实类"];
const arts: Record<string, string> = {
  tomato: "番茄",
  broccoli: "西兰花",
  carrot: "胡萝卜",
  lettuce: "生菜",
  pumpkin: "南瓜",
  cucumber: "黄瓜",
  potato: "土豆",
  onion: "洋葱",
};
function productStatus(
  p: Pick<Product, "active" | "available_date" | "stock">,
  today: string,
) {
  return !p.active
    ? "已下架"
    : p.available_date !== today
      ? "非今日售卖"
      : !p.stock
        ? "已售罄"
        : "今日在售";
}
export function Inventory({
  today,
  revision,
  refresh,
  notify,
}: {
  today: string;
  revision: number;
  refresh: () => void;
  notify: (message: string) => void;
}) {
  const { t, language } = useLanguage();
  const { data, setData, error, loading, updatedAt } = useVendorData<Product[]>(
    "/retailer/products",
    revision,
  );
  const products = data ?? [];
  const unavailable = loading || !!error;
  const [editing, setEditing] = useState<Product | null>();
  const [filters, updateFilters] = useVendorFilters(inventoryDefaults);
  const filter = inventoryFilters.some(([key]) => key === filters.status)
    ? (filters.status as InventoryFilter)
    : "all";
  const { search, category, sort } = filters;
  const parsedPage = Number(filters.page);
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const setSearch = (search: string) => updateFilters({ search, page: "1" });
  const setCategory = (category: string) =>
    updateFilters({ category, page: "1" });
  const setSort = (sort: string) => updateFilters({ sort, page: "1" });
  const setPage = (page: number) => updateFilters({ page: String(page) });
  const [adjusting, setAdjusting] = useState<Product>();
  const [busy, setBusy] = useState<number>();
  const [actionError, setActionError] = useState<Message>("");
  const [visibilityProduct, setVisibilityProduct] = useState<Product>();
  const [selected, setSelected] = useState<number[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  useEffect(() => {
    if (loading || error) return;
    const query = new URLSearchParams(window.location.search);
    const id = query.get("product");
    if (query.has("new")) setEditing(null);
    else if (id) {
      const product = products.find((p) => String(p.id) === id);
      if (product) setEditing(product);
    } else return;
    query.delete("product");
    query.delete("new");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query.size ? `?${query}` : ""}`,
    );
  }, [products, loading, error]);
  const close = useCallback(() => setEditing(undefined), []);
  const closeVisibility = useCallback(() => {
    setVisibilityProduct(undefined);
    setActionError("");
  }, []);
  const changeFilter = (status: InventoryFilter) =>
    updateFilters({ status, page: "1" });
  const toggle = async (p: Product) => {
    if (busy !== undefined || batchBusy || unavailable) return;
    setBusy(p.id);
    setActionError("");
    try {
      const saved = await api<Product>(
        `/retailer/products/${p.id}/visibility`,
        { method: "PATCH", body: JSON.stringify({ active: !p.active }) },
      );
      setData((current) =>
        current?.map((item) => (item.id === saved.id ? saved : item)),
      );
      closeVisibility();
      refresh();
      notify(
        saved.active
          ? "商品已恢复上架，请核对售卖日期"
          : "商品已下架，已有预购不受影响",
      );
    } catch (e) {
      setActionError(e as Error);
    } finally {
      setBusy(undefined);
    }
  };
  const query = search.trim().toLocaleLowerCase();
  const shown = products
    .filter(
      (p) =>
        inventoryMatches(p, filter, today) &&
        (!category || p.category === category) &&
        (!query ||
          [p.name, t(p.name), p.category, t(p.category), p.description]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)),
    )
    .sort((a, b) =>
      sort === "stock"
        ? a.stock - b.stock
        : sort === "price"
          ? a.price_cents - b.price_cents
          : sort === "name"
            ? t(a.name).localeCompare(t(b.name))
            : b.id - a.id,
    );
  const totalPages = Math.max(1, Math.ceil(shown.length / 8));
  const currentPage = Math.min(page, totalPages);
  const paginated = shown.slice((currentPage - 1) * 8, currentPage * 8);
  useEffect(
    () => setSelected([]),
    [filter, search, category, sort, currentPage],
  );
  const reset = () => updateFilters(inventoryDefaults);
  if (!data)
    return error ? (
      <VendorError error={error} refresh={refresh} />
    ) : (
      <VendorLoading kind="inventory" />
    );
  return (
    <div className="vendor-inventory">
      <VendorDataFeedback
        loading={loading}
        error={error}
        updatedAt={updatedAt}
        refresh={refresh}
      />
      <div className="vendor-inventory-summary">
        <div>
          <p>{t("核对日期、库存和价格，让顾客看到今天可以买到的收获。")}</p>
        </div>
        <button
          className="button primary"
          disabled={unavailable}
          onClick={() => setEditing(null)}
        >
          <Plus size={17} />
          {t("上架新商品")}
        </button>
      </div>
      <div className="vendor-inventory-counts">
        {(
          [
            ["today", "今日展示"],
            ["low", "库存偏低"],
            ["out", "已售罄"],
            ["hidden", "已下架"],
          ] as [InventoryFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => changeFilter(key)}
            aria-pressed={filter === key}
          >
            <span>{t(label)}</span>
            <strong>
              {products.filter((p) => inventoryMatches(p, key, today)).length}
            </strong>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <section
        className="vendor-panel vendor-catalogue"
        aria-label={t("商品库存列表")}
      >
        <div className="vendor-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder={t("搜索商品名称或描述…")}
              aria-label={t("搜索库存商品")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label={t("清除搜索")}>
                <X size={15} />
              </button>
            )}
          </label>
          <label className="vendor-filter-label">
            <SlidersHorizontal size={14} />
            {t("分类")}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t("全部分类")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="vendor-filter-label">
            {t("排序")}
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="default">{t("最新上架")}</option>
              <option value="stock">{t("库存从低到高")}</option>
              <option value="price">{t("价格从低到高")}</option>
              <option value="name">{t("按商品名称")}</option>
            </select>
          </label>
          <VendorRefresh refresh={refresh} loading={loading} />
        </div>
        <div
          className="vendor-tabs"
          role="group"
          aria-label={t("库存状态筛选")}
        >
          {inventoryFilters.map(([key, label]) => (
            <button
              key={key}
              onClick={() => changeFilter(key)}
              aria-pressed={filter === key}
            >
              {t(label)}
              <span>
                {products.filter((p) => inventoryMatches(p, key, today)).length}
              </span>
            </button>
          ))}
        </div>
        <VendorFilterChips
          chips={[
            ...(search
              ? [
                  {
                    label: t("搜索：{value}", { value: search }),
                    remove: () => setSearch(""),
                  },
                ]
              : []),
            ...(category
              ? [{ label: t(category), remove: () => setCategory("") }]
              : []),
            ...(filter !== "all"
              ? [
                  {
                    label: t(
                      inventoryFilters.find(([key]) => key === filter)![1],
                    ),
                    remove: () => changeFilter("all"),
                  },
                ]
              : []),
            ...(sort !== "default"
              ? [
                  {
                    label: t(
                      sort === "stock"
                        ? "库存从低到高"
                        : sort === "price"
                          ? "价格从低到高"
                          : "按商品名称",
                    ),
                    remove: () => setSort("default"),
                  },
                ]
              : []),
          ]}
          onReset={reset}
        />
        <InventoryBulkActions
          products={paginated}
          selected={selected}
          onSelection={setSelected}
          busy={batchBusy}
          onBusy={setBatchBusy}
          disabled={unavailable || busy !== undefined}
          onSaved={(saved) => {
            const updates = new Map(saved.map((p) => [p.id, p]));
            setData((current) => current?.map((p) => updates.get(p.id) ?? p));
            refresh();
            notify(
              t("已更新 {count} 款商品的展示状态", { count: saved.length }),
            );
          }}
        />
        {actionError && !visibilityProduct && (
          <VendorError error={actionError} refresh={refresh} />
        )}
        {!shown.length ? (
          <Empty
            icon={<Sprout />}
            title={products.length ? "没有符合条件的商品" : "这里还没有商品"}
            text={
              products.length
                ? "试试其他关键词，或清除筛选查看全部商品。"
                : "上架一份新鲜，让社区的顾客看见它。"
            }
            action={
              <button
                className="button secondary"
                disabled={!products.length && unavailable}
                onClick={products.length ? reset : () => setEditing(null)}
              >
                {t(products.length ? "清除筛选" : "上架新商品")}
              </button>
            }
          />
        ) : (
          <div className="vendor-table-wrap">
            <table className="vendor-table">
              <thead>
                <tr>
                  <th scope="col">{t("商品信息")}</th>
                  <th scope="col">{t("单价")}</th>
                  <th scope="col">{t("可预购库存")}</th>
                  <th scope="col">{t("售卖日期")}</th>
                  <th scope="col">{t("状态")}</th>
                  <th scope="col">{t("操作")}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => (
                  <tr
                    key={p.id}
                    className={
                      selected.includes(p.id)
                        ? "vendor-row-selected"
                        : undefined
                    }
                  >
                    <td className="vendor-product-cell">
                      <input
                        className="vendor-row-checkbox"
                        type="checkbox"
                        aria-label={t("选择 {name}", { name: t(p.name) })}
                        checked={selected.includes(p.id)}
                        disabled={
                          batchBusy || unavailable || busy !== undefined
                        }
                        onChange={(e) =>
                          setSelected((current) =>
                            e.target.checked
                              ? [...current, p.id]
                              : current.filter((id) => id !== p.id),
                          )
                        }
                      />
                      <div className={`mini-art art-bg-${p.art}`}>
                        <Produce kind={p.art} />
                      </div>
                      <div>
                        <strong>{t(p.name)}</strong>
                        <small>
                          {t(p.category)}
                          {p.organic ? (
                            <span className="vendor-organic">
                              <Leaf size={11} />
                              {t("有机")}
                            </span>
                          ) : null}
                        </small>
                      </div>
                    </td>
                    <td data-label={t("单价")}>
                      <strong>{money(p.price_cents)}</strong>
                      <small> / {t(p.unit)}</small>
                    </td>
                    <td data-label={t("可预购库存")}>
                      <button
                        className={`vendor-stock-control ${p.stock < 10 ? "vendor-stock-low" : "vendor-stock-normal"}`}
                        aria-label={t("调整 {name} 库存", { name: t(p.name) })}
                        onClick={() => setAdjusting(p)}
                        disabled={
                          busy !== undefined || batchBusy || unavailable
                        }
                      >
                        <strong>{p.stock}</strong> <span>{quantityUnit(language, p.unit, p.stock)}</span>
                        <Plus size={12} />
                        <span className="vendor-stock-level" aria-hidden="true">
                          <span
                            style={{ width: `${Math.min(100, p.stock * 10)}%` }}
                          />
                        </span>
                      </button>
                    </td>
                    <td data-label={t("售卖日期")}>
                      <span
                        className={
                          p.available_date !== today
                            ? "vendor-date-warning"
                            : ""
                        }
                      >
                        {p.available_date}
                      </span>
                    </td>
                    <td data-label={t("状态")}>
                      <span
                        className={`status-badge status-${!p.active || p.available_date !== today ? "cancelled" : p.stock ? "confirmed" : "pending"}`}
                      >
                        {t(productStatus(p, today))}
                      </span>
                    </td>
                    <td className="vendor-table-actions">
                      <button
                        className="button secondary"
                        onClick={() => setEditing(p)}
                        disabled={
                          busy !== undefined || batchBusy || unavailable
                        }
                      >
                        {t("编辑")}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t(
                          p.active ? "下架 {name}" : "上架 {name}",
                          { name: t(p.name) },
                        )}
                        title={t(p.active ? "下架商品" : "恢复上架")}
                        disabled={
                          busy !== undefined || batchBusy || unavailable
                        }
                        onClick={() =>
                          p.active
                            ? (setActionError(""), setVisibilityProduct(p))
                            : void toggle(p)
                        }
                      >
                        {busy === p.id ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : p.active ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="vendor-pagination">
          <span role="status">
            {t("共 {count} 款商品", { count: shown.length })}
          </span>
          {(query || category || filter !== "all") && (
            <button className="text-button" onClick={reset}>
              {t("清除筛选")}
            </button>
          )}
          <div>
            <button
              className="icon-button"
              aria-label={t("上一页")}
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <button
              className="icon-button"
              aria-label={t("下一页")}
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <p className="vendor-footnote">
        <Info size={16} />
        {t(
          "库存为尚可预购的数量；预购自动扣减，取消自动归还。下架商品不会取消已有订单。",
        )}
      </p>
      {editing !== undefined && (
        <ProductEditor
          product={editing}
          unavailable={unavailable}
          today={today}
          onClose={close}
          onSaved={(saved) => {
            setData((current) =>
              editing
                ? current?.map((p) => (p.id === saved.id ? saved : p))
                : [saved, ...(current ?? [])],
            );
            close();
            refresh();
            notify("商品已保存");
          }}
        />
      )}
      {adjusting && (
        <StockAdjuster
          product={adjusting}
          unavailable={unavailable}
          onClose={() => setAdjusting(undefined)}
          onSaved={(saved) => {
            setData((current) =>
              current?.map((item) => (item.id === saved.id ? saved : item)),
            );
            setAdjusting(undefined);
            refresh();
            notify("库存已更新");
          }}
        />
      )}
      {visibilityProduct && (
        <Modal
          title="下架这款商品？"
          onClose={closeVisibility}
          busy={busy !== undefined}
        >
          <p className="modal-intro">{t(visibilityProduct.name)}</p>
          <p className="vendor-confirm-copy">
            {t(
              "下架后，顾客无法新建此商品的预购。已有订单仍需正常履约，你可以随时恢复上架。",
            )}
          </p>
          {actionError && (
            <p className="form-error" role="alert">
              {t(actionError)}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={closeVisibility}
              disabled={busy !== undefined}
            >
              {t("保留上架")}
            </button>
            <button
              className="button danger"
              onClick={() => void toggle(visibilityProduct)}
              disabled={busy !== undefined || unavailable}
            >
              {t(busy !== undefined ? "正在更新…" : "确认下架")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProductEditor({
  product: p,
  unavailable,
  today,
  onClose,
  onSaved,
}: {
  product: Product | null;
  unavailable: boolean;
  today: string;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const { t } = useLanguage();
  const initial = {
    name: p?.name ?? "",
    category: p?.category ?? "叶菜类",
    art: p?.art ?? "lettuce",
    unit: p?.unit ?? "磅",
    price: p ? String(p.price_cents / 100) : "",
    stock: String(p?.stock ?? 0),
    date: p?.available_date ?? today,
    description: p?.description ?? "",
    organic: !!p?.organic,
    active: p ? !!p.active : true,
  };
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>("");
  const [discard, setDiscard] = useState(false);
  const [expectedStock, setExpectedStock] = useState(p?.stock);
  const [readingStock, setReadingStock] = useState(false);
  const [stockConflict, setStockConflict] = useState(false);
  const locked = busy || readingStock;
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const close = useCallback(
    () => (changed ? setDiscard(true) : onClose()),
    [changed, onClose],
  );
  const field = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (locked || stockConflict || unavailable) return;
    if (!draft.name.trim()) {
      setError("请输入商品名称。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await api<Product>(
        p ? `/retailer/products/${p.id}` : "/retailer/products",
        {
          method: p ? "PUT" : "POST",
          body: JSON.stringify({
            name: draft.name.trim(),
            category: draft.category,
            art: draft.art,
            unit: draft.unit,
            price_cents: Math.round(Number(draft.price) * 100),
            stock: Number(draft.stock),
            ...(p ? { expected_stock: expectedStock } : {}),
            available_date: draft.date,
            description: draft.description.trim(),
            organic: draft.organic,
            active: draft.active,
          }),
        },
      );
      onSaved(saved);
    } catch (e) {
      const message = (e as Error).message;
      setError(e as Error);
      if (message === "库存已变化，请读取最新库存后重新核对。")
        setStockConflict(true);
    } finally {
      setBusy(false);
    }
  };
  const status = productStatus(
    {
      active: Number(draft.active),
      available_date: draft.date,
      stock: Number(draft.stock),
    },
    today,
  );
  return (
    <Modal
      title={
        discard ? "放弃未保存的修改？" : p ? "编辑这份新鲜" : "上架一份新鲜"
      }
      onClose={discard ? () => setDiscard(false) : close}
      busy={locked}
      wide={!discard}
    >
      {discard ? (
        <>
          <p className="vendor-confirm-copy">
            {t("你的修改尚未保存，离开后将丢失。")}
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDiscard(false)}
            >
              <ArrowLeft size={15} />
              {t("继续编辑")}
            </button>
            <button className="button danger" onClick={onClose}>
              {t("放弃修改")}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={save} className="vendor-editor">
          <fieldset
            className="form-fields vendor-editor-fields"
            disabled={locked}
          >
            <div className="vendor-editor-section">
              <span className="eyebrow">01 / {t("商品资料")}</span>
              <label>
                {t("商品名称")}
                <input
                  required
                  maxLength={50}
                  value={t(draft.name)}
                  onChange={(e) => field("name", e.target.value)}
                  placeholder={t("例如：刚采收的田园番茄")}
                />
              </label>
              <div className="form-row">
                <label>
                  {t("蔬菜分类")}
                  <select
                    value={draft.category}
                    onChange={(e) => field("category", e.target.value)}
                  >
                    {categories.map((c) => (
                      <option value={c} key={c}>
                        {t(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("商品插画")}
                  <select
                    value={draft.art}
                    onChange={(e) => field("art", e.target.value)}
                  >
                    {Object.entries(arts).map(([key, label]) => (
                      <option value={key} key={key}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                {t("关于这份新鲜")}
                <textarea
                  maxLength={500}
                  rows={3}
                  value={t(draft.description)}
                  onChange={(e) => field("description", e.target.value)}
                  placeholder={t("介绍产地、口感或推荐做法…")}
                />
              </label>
              <label className="vendor-checkbox">
                <input
                  type="checkbox"
                  checked={draft.organic}
                  onChange={(e) => field("organic", e.target.checked)}
                />
                {t("有机种植")}
              </label>
            </div>
            <div className="vendor-editor-section">
              <span className="eyebrow">02 / {t("价格与库存")}</span>
              <div className="form-row">
                <label>
                  {t("售价（USD）")}
                  <input
                    required
                    type="number"
                    min="0.01"
                    max="1000"
                    step="0.01"
                    value={draft.price}
                    onChange={(e) => field("price", e.target.value)}
                  />
                </label>
                <label>
                  {t("计价单位")}
                  <select
                    value={draft.unit}
                    onChange={(e) => field("unit", e.target.value)}
                  >
                    {["磅", "颗", "把", "个", "袋"].map((u) => (
                      <option value={u} key={u}>
                        {t(u)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                {t("可预购库存")}
                <input
                  required
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={draft.stock}
                  onChange={(e) => field("stock", e.target.value)}
                />
              </label>
              <p className="helper-text">
                {t("填写当前剩余的可预购数量，不含已预留订单。")}
              </p>
            </div>
            <div className="vendor-editor-section">
              <span className="eyebrow">03 / {t("展示设置")}</span>
              <label>
                {t("售卖日期（美国东部）")}
                <input
                  required
                  type="date"
                  value={draft.date}
                  onChange={(e) => field("date", e.target.value)}
                />
              </label>
              {draft.date !== today && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => field("date", today)}
                >
                  {t("改为今天")} · {today}
                </button>
              )}
              <label className="vendor-checkbox">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => field("active", e.target.checked)}
                />
                {t("上架展示")}
              </label>
              <p className="helper-text">
                {t(
                  "仅售卖日期为今天且已上架的商品会出现在顾客端。库存为 0 时显示售罄。",
                )}
              </p>
            </div>
          </fieldset>
          <aside className="vendor-product-preview">
            <span className="eyebrow">{t("商品预览")}</span>
            <div className={`vendor-preview-art art-bg-${draft.art}`}>
              <Produce kind={draft.art} />
            </div>
            <span
              className={`status-badge status-${!draft.active || draft.date !== today ? "cancelled" : Number(draft.stock) ? "confirmed" : "pending"}`}
            >
              {t(status)}
            </span>
            <h3>{t(draft.name || "你的新鲜商品")}</h3>
            <p>
              {t(draft.category)}
              {draft.organic ? ` · ${t("有机种植")}` : ""}
            </p>
            <strong>
              {money(
                Number.isFinite(Number(draft.price))
                  ? Math.round(Number(draft.price) * 100)
                  : 0,
              )}
              <small> / {t(draft.unit)}</small>
            </strong>
            <p>
              {t("可预购 {count} {unit}", {
                count: draft.stock || 0,
                unit: { unit: draft.unit, count: Number(draft.stock) },
              })}
            </p>
            <span className="vendor-preview-note">
              {t("今日调价会更新今日历史价格记录。")}
            </span>
          </aside>
          <div className="vendor-editor-footer">
            {error && (
              <div className="vendor-editor-error">
                <p className="form-error" role="alert">
                  {t(error)}
                </p>
                {p && stockConflict && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={readingStock || busy}
                    onClick={async () => {
                      setReadingStock(true);
                      try {
                        const products =
                          await api<Product[]>("/retailer/products");
                        const latest = products.find(
                          (item) => item.id === p.id,
                        );
                        if (!latest)
                          throw new Error("商品不存在或不属于当前商户。");
                        setExpectedStock(latest.stock);
                        field("stock", String(latest.stock));
                        setError("");
                        setStockConflict(false);
                      } catch (e) {
                        setError(e as Error);
                      } finally {
                        setReadingStock(false);
                      }
                    }}
                  >
                    {t(readingStock ? "正在读取库存…" : "读取最新库存")}
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={close}
              disabled={locked}
            >
              {t("取消")}
            </button>
            <button
              className="button primary"
              disabled={locked || stockConflict || unavailable}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              {t(busy ? "正在保存…" : "保存商品")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function StockAdjuster({
  product,
  unavailable,
  onClose,
  onSaved,
}: {
  product: Product;
  unavailable: boolean;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const { t, language } = useLanguage();
  const [baseline, setBaseline] = useState(product.stock);
  const [quantity, setQuantity] = useState(String(product.stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>("");
  const [conflict, setConflict] = useState(false);
  const stock = Number(quantity);
  const valid =
    quantity.trim() !== "" &&
    Number.isInteger(stock) &&
    stock >= 0 &&
    stock <= 10000;
  const difference = stock - baseline;
  const readStock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const products = await api<Product[]>("/retailer/products");
      const latest = products.find((item) => item.id === product.id);
      if (!latest) throw new Error("商品不存在或不属于当前商户。");
      setBaseline(latest.stock);
      setQuantity(String(latest.stock));
      setError("");
      setConflict(false);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || unavailable || conflict || !valid || difference === 0) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api<Product>(
        `/retailer/products/${product.id}/stock`,
        {
          method: "PATCH",
          body: JSON.stringify({ stock, expected_stock: baseline }),
        },
      );
      onSaved(saved);
    } catch (e) {
      const message = (e as Error).message;
      setError(e as Error);
      if (message === "库存已变化，请读取最新库存后重新核对。")
        setConflict(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="调整可预购库存" onClose={onClose} busy={busy}>
      <div className="vendor-adjust-product">
        <div className={`mini-art art-bg-${product.art}`}>
          <Produce kind={product.art} />
        </div>
        <div>
          <strong>{t(product.name)}</strong>
          <span>
            {t("当前库存 {count} {unit}", {
              count: baseline,
              unit: { unit: product.unit, count: baseline },
            })}
          </span>
        </div>
      </div>
      <form className="form-stack vendor-stock-form" onSubmit={save}>
        <fieldset className="form-fields form-stack" disabled={busy}>
          <label>
            {t("调整后的可预购数量")}
            <div className="vendor-quantity-input">
              <button
                type="button"
                aria-label={t("库存减一")}
                disabled={!valid || stock === 0}
                onClick={() => setQuantity(String(stock - 1))}
              >
                −
              </button>
              <input
                aria-label={t("调整后的可预购数量")}
                required
                type="number"
                min="0"
                max="10000"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <button
                type="button"
                aria-label={t("库存加一")}
                disabled={!valid || stock === 10000}
                onClick={() => setQuantity(String(stock + 1))}
              >
                +
              </button>
            </div>
          </label>
          <div
            className="vendor-stock-presets"
            role="group"
            aria-label={t("快速补货")}
          >
            {[5, 10, 20].map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={!valid || stock + amount > 10000}
                onClick={() => setQuantity(String(stock + amount))}
              >
                +{amount} {quantityUnit(language, product.unit, amount)}
              </button>
            ))}
          </div>
          <div className="vendor-stock-difference" role="status">
            <span>{t("本次调整")}</span>
            <strong>
              {!valid
                ? "—"
                : difference === 0
                  ? t("未变化")
                  : `${difference > 0 ? "+" : ""}${difference} ${quantityUnit(language, product.unit, Math.abs(difference))}`}
            </strong>
          </div>
          <p className="helper-text">
            {t(
              "补货增加数量，现场售出则减少数量。这里不包含已预留的预购商品。",
            )}
          </p>
        </fieldset>
        {error && (
          <div>
            <p className="form-error" role="alert">
              {t(error)}
            </p>
            {conflict && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void readStock()}
              >
                {t("读取最新库存")}
              </button>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button
            className="button secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            {t("取消")}
          </button>
          <button
            className="button primary"
            disabled={
              busy || unavailable || conflict || !valid || difference === 0
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            {t(busy ? "正在保存…" : "确认调整")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
