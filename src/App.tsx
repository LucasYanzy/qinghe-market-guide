import { LanguageSwitcher, useLanguage, type Message } from "./i18n";
import { matchesSearch, quantityUnit } from "./translations/translate";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, money, shortDate } from "./api";
import { BasketArt, Produce } from "./Produce";
import MarketGuide, { HelpCenter } from "./MarketGuide";
import guide from "../references/rutgers-market-guide.json";
import { officialMarketUrl } from "./marketReference";
import ReferencePrices from "./ReferencePrices";
import { PageLink, useNavigation, type Page } from "./navigation";
import { AboutMarket, PreorderSteps } from "./VisitorGuide";
import { InteractiveHero, MotionGrid, ScrollActions, usePageMotion } from "./motion";
import type {
  Config,
  Dashboard,
  Order,
  OrderStatus,
  PriceData,
  Product,
  Role,
  User,
} from "./types";

type Cart = Record<number, number>;
type CheckoutDraft = { slot: string; note: string };
const statusLabels: Record<OrderStatus, string> = {
  pending: "待商户确认",
  confirmed: "待到场自提",
  completed: "已完成",
  cancelled: "已取消",
};
const clientNav = [
  { id: "discover", label: "逛逛市集", icon: Store },
  { id: "markets", label: "市场与导航", icon: MapPin },
  { id: "prices", label: "价格观察", icon: BarChart3 },
  { id: "orders", label: "我的预购", icon: ShoppingBag },
  { id: "about", label: "关于青禾", icon: Leaf },
  { id: "help", label: "帮助与食品援助", icon: Leaf },
] as const;
const retailerNav = [
  { id: "dashboard", label: "经营概览", icon: BarChart3 },
  { id: "inventory", label: "商品与库存", icon: Sprout },
  { id: "orders", label: "预购订单", icon: ShoppingBag },
  { id: "prices", label: "价格观察", icon: TrendingUp },
  { id: "help", label: "帮助与食品援助", icon: Leaf },
] as const;

function Modal({
  title,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    if (busy || closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) onClose();
    else setClosing(true);
  }, [busy, closing, onClose]);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClose, 150);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = original;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
      if (e.key === "Tab") {
        const focusable = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
          ) ?? [],
        ).filter(
          (element) =>
            element.tabIndex >= 0 && element.getClientRects().length > 0,
        );
        if (!focusable.length) {
          e.preventDefault();
          ref.current?.focus();
          return;
        }
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
    };
  }, [requestClose, busy]);
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={t(title)}
        aria-busy={busy}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-title">
          <h2>{t(title)}</h2>
          <button
            className="icon-button"
            onClick={requestClose}
            aria-label={t("关闭弹窗")}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Empty({
  icon = <ShoppingBag />,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{t(title)}</h3>
      <p>{t(text)}</p>
      {action}
    </div>
  );
}
function App() {
  const { t, language } = useLanguage();
  const [config, setConfig] = useState<Config>();
  const [user, setUser] = useState<User | null>(null);
  const { page, navigate: changePage, replacePage } = useNavigation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Message>("");
  const [toast, setToast] = useState<{ message: Message; id: number } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<Cart>({});
  const [checkout, setCheckout] = useState<CheckoutDraft>({
    slot: "",
    note: "",
  });
  const [loginIntent, setLoginIntent] = useState<"cart" | "orders" | null>(
    null,
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [detail, setDetail] = useState<Product>();
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部蔬菜");
  const [sort, setSort] = useState("recommended");
  const [inStock, setInStock] = useState(false);
  const retailer = user?.role === "retailer";
  const notify = useCallback((message: Message) => {
    setToast((previous) => ({ message, id: (previous?.id ?? 0) + 1 }));
  }, []);
  const mainRef = usePageMotion(page, !loading && !!config);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileNav) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'))
      .filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNav(false);
      }
      if (event.key === "Tab") {
        const elements = controls();
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    const breakpoint = window.matchMedia("(min-width: 761px)");
    const resize = () => { if (breakpoint.matches) setMobileNav(false); };
    document.addEventListener("keydown", keydown);
    breakpoint.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", keydown);
      breakpoint.removeEventListener("change", resize);
      if (previous?.isConnected) previous.focus();
    };
  }, [mobileNav]);
  const refresh = useCallback(() => {
    setRevision((r) => r + 1);
  }, []);
  const load = useCallback(async () => {
    setLoadError("");
    setLoading(true);
    try {
      const [c, u, p] = await Promise.all([
        api<Config>("/config"),
        api<{ user: User | null }>("/auth/me"),
        api<Product[]>("/products"),
      ]);
      setConfig(c);
      setUser(u.user);
      setProducts(p);
      if (u.user?.role === "retailer" && window.location.pathname === "/")
        replacePage("dashboard");
    } catch (e) {
      setLoadError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [replacePage]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (revision)
      api<Product[]>("/products")
        .then(setProducts)
        .catch((e) => notify(e));
  }, [revision, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  // Refresh the business date and listings when a long-running tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      api<Config>("/config")
        .then(setConfig)
        .catch(() => {});
      refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  const navigate = (next: Page) => {
    changePage(next);
    setMobileNav(false);
  };
  const onLogin = (next: User) => {
    setUser(next);
    const resetCart = next.role === "retailer" || (user && user.id !== next.id);
    if (resetCart) {
      setCart({});
      setCheckout({ slot: "", note: "" });
    }
    setAuthOpen(false);
    setCartOpen(loginIntent === "cart" && !resetCart);
    navigate(
      next.role === "retailer"
        ? page === "inventory"
          ? "inventory"
          : "dashboard"
        : loginIntent === "orders"
          ? "orders"
          : page === "dashboard" || page === "inventory" || page === "not-found"
            ? "discover"
            : page,
    );
    setLoginIntent(null);
    refresh();
    notify(
      loginIntent === "cart" && !resetCart
        ? "登录成功，请确认自提信息后提交预购"
        : { message: "欢迎回来，{name}", values: { name: next.role === "retailer" ? { message: next.name } : next.name } },
    );
  };
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setCart({});
      setCheckout({ slot: "", note: "" });
      navigate("discover");
      notify("已退出登录");
    } catch (e) {
      notify(e as Error);
    }
  };
  const add = (product: Product) => {
    if (retailer) return;
    if ((cart[product.id] ?? 0) >= product.stock)
      return notify("已达到当前库存数量");
    setCart((c) => ({ ...c, [product.id]: (c[product.id] ?? 0) + 1 }));
    notify({ message: "{product} 已加入购物袋", values: { product: { message: product.name } } });
  };
  const remove = (product: Product) => {
    setCart((current) => {
      const next = { ...current };
      if ((next[product.id] ?? 0) <= 1) delete next[product.id];
      else next[product.id]--;
      return next;
    });
  };
  const cartTotal = products.reduce((total, product) => total + product.price_cents * (cart[product.id] ?? 0), 0);
  const resetFilters = () => {
    setSearch(""); setCategory("全部蔬菜"); setInStock(false); setSort("recommended");
  };
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  let visible = products.filter(
    (p) =>
      (category === "全部蔬菜" || p.category === category) &&
      (!inStock || p.stock > 0) &&
      matchesSearch(search, p.name, p.farm),
  );
  if (sort === "price-up")
    visible = [...visible].sort((a, b) => a.price_cents - b.price_cents);
  if (sort === "price-down")
    visible = [...visible].sort((a, b) => b.price_cents - a.price_cents);
  const nav = retailer ? retailerNav : clientNav;
  const title = {
    discover: "逛逛市集",
    markets: "市场与导航",
    prices: "价格观察",
    orders: retailer ? "预购订单" : "我的预购",
    about: "关于青禾",
    help: "帮助与食品援助",
    dashboard: "经营概览",
    inventory: "商品与库存",
    "not-found": "页面未找到",
  }[page];
  useEffect(() => {
    document.title = t("{page} · 青禾 Rutgers 社区农夫市集", { page: t(title) });
    setMobileNav(false);
  }, [title, page, t]);
  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    if (loginIntent === "cart") setCartOpen(true);
    setLoginIntent(null);
  }, [loginIntent]);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const closeDetail = useCallback(() => setDetail(undefined), []);
  if (loading)
    return (
      <div className="boot-screen">
        <Leaf size={44} />
        <h2>{t("青禾 QINGHE")}</h2>
        <LoaderCircle className="spin" />
        <p>{t("正在准备今日的新鲜…")}</p>
      </div>
    );
  if (loadError || !config)
    return (
      <div className="boot-screen">
        <Sprout size={44} />
        <h2>{t("暂时无法连接市集")}</h2>
        <p>{t(loadError)}</p>
        <button className="button primary" onClick={() => void load()}>{t("重新连接")}</button>
      </div>
    );
  return (
    <div className={`app-shell ${retailer ? "retailer-site" : "visitor-site"} ${cartCount ? "has-cart" : ""}`}>
      <a href="#main-content" className="skip-link">{t("跳到主要内容")}</a>
      {mobileNav && (
        <button
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
          aria-label={t("关闭导航")}
        />
      )}
      <aside ref={sidebarRef} id="market-navigation" className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}
        role={mobileNav ? "dialog" : undefined} aria-modal={mobileNav || undefined} aria-label={t("主导航")}>
        <button className="icon-button nav-close" aria-label={t("关闭导航")} onClick={() => setMobileNav(false)}><X size={18} /></button>
        <PageLink
          className="brand"
          page={retailer ? "dashboard" : "discover"}
          navigate={navigate}
        >
          <span className="brand-symbol">
            <Leaf size={25} />
          </span>
          <span>
            <b>{t("青禾")}{language === "zh" && <span className="brand-english" lang="en">QINGHE</span>}
            </b>
            <small>{t("RUTGERS FARMERS MARKET")}</small>
          </span>
        </PageLink>
        <div className="workspace-label">
          <span className="tiny-dot" />
          {t(retailer ? "RETAILER · 商户工作台" : "CLIENT · 顾客空间")}
        </div>
        <nav aria-label={t("主导航")}>
          {nav.map((item) => (
            <PageLink
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              active={page === item.id}
              page={item.id}
              navigate={navigate}
            >
              <item.icon size={20} />
              {t(item.label)}
              {page === item.id && <span className="nav-active-dot" />}
            </PageLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-leaf">
            <Sprout size={28} />
          </span>
          <h4>{t("好食物，连接好邻里。")}</h4>
          <p>{t("支持在地农场")}<br />{t("让每一口新鲜都有来处。")}</p>
          <span>{t("LOCAL FOOD. LOCAL GOOD.")}</span>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">{t(user ? user.name : "青").slice(0, 1)}</div>
          <div>
            <strong>{t(user?.name ?? "欢迎来到青禾")}</strong>
            <small>
              {t(user
                ? retailer
                  ? "农场商户"
                  : "社区新鲜探索者"
                : "登录，开启新鲜日常")}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label={t(user ? "退出登录" : "登录")}
            onClick={() => { setMobileNav(false); if (user) void logout(); else setAuthOpen(true); }}
          >
            {user ? <LogOut size={17} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </aside>
      <div className="main-shell" inert={mobileNav}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              aria-controls="market-navigation"
              className="icon-button mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label={t("打开导航")}
              aria-expanded={mobileNav}
            >
              <Menu />
            </button>
            <span>{t("社区农夫市集")}</span>
            <ChevronRight size={14} />
            <strong>{t(title)}</strong>
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <span className="today-label">
              <span className="tiny-dot" />
              {t(config.today.replaceAll("-", "."))}{t(" ")}
              <span className="timezone-label">ET</span>
            </span>
            <button className="role-switch" onClick={() => setAuthOpen(true)}>
              <Users size={16} />
              {t(retailer ? "切换到顾客端" : "商户入口")}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </header>
        <main ref={mainRef} id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {t(retailer
                  ? "GROW YOUR LOCAL BUSINESS"
                  : "A LITTLE FRESHNESS, EVERY DAY")}
              </div>
              <h1>
                {t(page === "discover" ? "今天，也要好好吃饭。" : title).replace(/[。.]+$/, "")}
                <span className="heading-dot">{t("。")}</span>
              </h1>
              <p>
                {t(page === "discover"
                  ? "从附近的农场，到你的餐桌。发现这一季刚刚好的新鲜。"
                  : page === "dashboard"
                    ? "照顾好每一份收获，让新鲜被更多人看见。"
                    : page === "inventory"
                      ? "今日上架、价格与库存，在这里轻松管理。"
                      : page === "markets"
                        ? "找到身边的市集，让新鲜离你更近一点。"
                        : page === "prices"
                          ? "看懂价格的变化，为每一次选择多一份参考。"
                          : page === "help"
                            ? "食品援助、使用指引与常见问题，陪你安心逛市集。"
                            : page === "about"
                              ? "从屏幕到餐桌，让新鲜和邻里更近一点。"
                              : "每一份期待，都值得新鲜抵达。")}
              </p>
            </div>
            {!retailer && (
              <button
                className="button cart-button"
                onClick={() => setCartOpen(true)}
              >
                <ShoppingBag size={18} />{t("购物袋")}<span key={cartCount} className="count-pill quantity-pop">{cartCount}</span>
              </button>
            )}
          </div>
          {config.demo && (
            <div className="demo-notice">
              <span className="demo-badge">{t("DEMO")}</span>{t(" ")}{t("市场目录已核对官网；商品、库存与预购为演示，官方页面的 2025 年日程不代表当前营业安排。")}{retailer && t(" 商户修改会影响当前演示商品与订单。")}
            </div>
          )}
          {page === "discover" && (
            <>
              <InteractiveHero>
                <div className="hero-copy">
                  <div className="hero-kicker">
                    <span />{t("在地生长 · 当季新鲜")}</div>
                  <h2>{t("把田野的新鲜，\n带回你的餐桌")}<span>{t("。")}</span>
                  </h2>
                  <p>{t("一份当季蔬菜，一点简单的幸福。")}<br />{t("提前预购，来市集把好味道带回家。")}</p>
                  <div className="hero-actions">
                    <a className="button primary" href="#today-produce">{t("挑选今日蔬菜")}<ArrowRight size={17} />
                    </a>
                    <PageLink
                      className="hero-guide-link"
                      page="about"
                      navigate={navigate}
                    >{t("了解预购流程")}<ChevronRight size={15} />
                    </PageLink>
                  </div>
                  <div className="hero-footnote">
                    <Sprout size={14} />{t("和社区一起，把日子过得更鲜活。")}</div>
                </div>
                <BasketArt />
              </InteractiveHero>
              <div className="benefits">
                <div>
                  <span className="benefit-icon">
                    <Leaf size={22} />
                  </span>
                  <div>
                    <strong>{t("当季采收")}</strong>
                    <small>{t("看得见的新鲜与来处")}</small>
                  </div>
                </div>
                <div>
                  <span className="benefit-icon peach">
                    <ShoppingBag size={22} />
                  </span>
                  <div>
                    <strong>{t("线上预购")}</strong>
                    <small>{t("选好新鲜，到场轻松取")}</small>
                  </div>
                </div>
                <div>
                  <span className="benefit-icon lilac">
                    <TrendingUp size={22} />
                  </span>
                  <div>
                    <strong>{t("价格透明")}</strong>
                    <small>{t("历史走势，心中有数")}</small>
                  </div>
                </div>
              </div>
              <div className="section-heading" id="today-produce">
                <div>
                  <span className="eyebrow">{t("FRESH FROM THE FARM")}</span>
                  <h2>{t("今日新鲜上架")}{t(" ")}
                    <span className="subtle-count">
                      {t("{count} 款当季好物", { count: products.length })}</span>
                  </h2>
                </div>
                <span className="harvest-tag">
                  <span className="tiny-dot" />{t("今日可预购")}</span>
              </div>
              <div className="product-toolbar">
                <div
                  className="category-tabs"
                  role="group"
                  aria-label={t("蔬菜分类")}
                >
                  {["全部蔬菜", "叶菜类", "根茎类", "果实类"].map((c) => (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      aria-pressed={category === c}
                      onClick={() => setCategory(c)}
                    >
                      {c === "全部蔬菜" && <Sprout size={16} />} {t(c)}
                    </button>
                  ))}
                </div>
                <div className="filter-actions">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label={t("搜索蔬菜或农场")}
                      placeholder={t("找找你喜欢的蔬菜…")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        aria-label={t("清除搜索")}
                        onClick={() => setSearch("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <label className="sort-select">
                    <SlidersHorizontal size={15} />
                    <select
                      aria-label={t("商品排序")}
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recommended">{t("推荐排序")}</option>
                      <option value="price-up">{t("价格从低到高")}</option>
                      <option value="price-down">{t("价格从高到低")}</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="results-meta">
                <span aria-live="polite" aria-atomic="true"><span key={visible.length} className="result-count">{t("发现 {count} 款新鲜好物", { count: visible.length })}</span></span>
                <label>
                  <input
                    type="checkbox"
                    checked={inStock}
                    onChange={(e) => setInStock(e.target.checked)}
                  />{t(" ")}{t("仅看有库存")}</label>
              </div>
              {(category !== "全部蔬菜" || search || inStock || sort !== "recommended") && (
                <div className="active-filters" role="group" aria-label={t("当前筛选条件")}>
                  {category !== "全部蔬菜" && <button className="filter-chip" onClick={() => setCategory("全部蔬菜")} aria-label={t("移除分类筛选")}><span>{t(category)}</span><X size={12} /></button>}
                  {search && <button className="filter-chip" onClick={() => setSearch("")} aria-label={t("清除搜索")}><Search size={12} /><span>{search}</span><X size={12} /></button>}
                  {inStock && <button className="filter-chip" onClick={() => setInStock(false)} aria-label={t("移除库存筛选")}><span>{t("仅看有库存")}</span><X size={12} /></button>}
                  {sort !== "recommended" && <button className="filter-chip" onClick={() => setSort("recommended")} aria-label={t("恢复推荐排序")}><span>{t(sort === "price-up" ? "价格从低到高" : "价格从高到低")}</span><X size={12} /></button>}
                  <button className="clear-filters" onClick={resetFilters}>{t("重置全部")}</button>
                </div>
              )}
              {visible.length ? (
                <MotionGrid layoutKey={visible.map((product) => product.id).join(",")}>
                  {visible.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={cart[product.id] ?? 0}
                      onAdd={() => add(product)}
                      onRemove={() => remove(product)}
                      onView={() => setDetail(product)}
                    />
                  ))}
                </MotionGrid>
              ) : (
                <Empty
                  icon={<Search />}
                  title={
                    t(products.length ? "还没找到这份新鲜" : "今日暂未上架商品")
                  }
                  text={
                    t(products.length
                      ? "试试其他分类或关键词，也可以查看暂时售罄的商品。"
                      : "稍后再来看看；也可以先查看官方市场目录、历史采价与食品援助资源。")
                  }
                  action={
                    <button
                      className="button secondary"
                      onClick={() => {
                        if (!products.length) return navigate("markets");
                        resetFilters();
                      }}
                    >
                      {t(products.length ? "清除筛选" : "查看市场目录")}
                    </button>
                  }
                />
              )}
              {guide.locations[0] && (
                <section className="market-strip">
                  <div className="market-strip-icon">
                    <Store size={30} />
                  </div>
                  <div>
                    <span className="eyebrow">{t("MEET US AT THE MARKET")}</span>
                    <h3>{t("下次见面，就在市集。")}</h3>
                    <p>
                      {t(guide.locations[0].name)} · {t(guide.locations[0].address)}
                    </p>
                    {config.demo && (
                      <p>{t("官方地址参考 · 当季营业安排请先向官方确认")}</p>
                    )}
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => navigate("markets")}
                  >{t("查看市场与导航")}<ArrowUpRight size={17} />
                  </button>
                </section>
              )}
              <PreorderSteps navigate={navigate} />
            </>
          )}
          {page === "markets" && <MarketGuide />}
          {page === "help" && <HelpCenter />}
          {page === "prices" && (
            <Prices products={products} revision={revision} />
          )}
          {page === "about" && (
            <AboutMarket navigate={navigate} demo={config.demo} />
          )}
          {page === "not-found" && (
            <Empty
              icon={<MapPin />}
              title={t("这条小路还没通往市集")}
              text={t("链接可能已变更。回到首页，继续寻找当季的新鲜吧。")}
              action={
                <PageLink
                  page="discover"
                  navigate={navigate}
                  className="button primary"
                >{t("返回市集首页")}<ArrowRight size={16} />
                </PageLink>
              }
            />
          )}
          {(page === "dashboard" || page === "inventory") && !retailer && (
            <Empty
              icon={<Store />}
              title={t("这里是商户工作台")}
              text={t("请登录商户账号，管理商品、库存和预购订单。")}
              action={
                <button
                  className="button primary"
                  onClick={() => setAuthOpen(true)}
                >{t("商户登录")}<ArrowRight size={16} />
                </button>
              }
            />
          )}
          {page === "orders" && (
            <Orders
              user={user}
              revision={revision}
              refresh={refresh}
              notify={notify}
              onLogin={() => {
                setLoginIntent("orders");
                setAuthOpen(true);
              }}
              onShop={() => navigate("discover")}
            />
          )}
          {page === "dashboard" && retailer && (
            <RetailDashboard
              revision={revision}
              navigate={navigate}
              notify={notify}
            />
          )}
          {page === "inventory" && retailer && (
            <Inventory
              today={config.today}
              revision={revision}
              refresh={refresh}
              notify={notify}
            />
          )}
          <footer className="site-footer">
            <div className="footer-brand">
              <span>
                <Leaf size={20} />
                <strong>{t("青禾 QINGHE")}</strong>
              </span>
              <p>{t("让新鲜，发生在身边。")}</p>
              <small>
                {t(config.demo
                  ? "社区市集项目 · 演示网站"
                  : "Rutgers Community Farmers Market")}
              </small>
            </div>
            <nav aria-label={t("页脚导航")}>
              <span>{t("探索市集")}</span>
              <PageLink page="discover" navigate={navigate}>{t("今日蔬菜")}</PageLink>
              <PageLink page="markets" navigate={navigate}>{t("市场与导航")}</PageLink>
              <PageLink page="prices" navigate={navigate}>{t("价格观察")}</PageLink>
            </nav>
            <nav aria-label={t("访客指南")}>
              <span>{t("第一次来")}</span>
              <PageLink page="about" navigate={navigate}>{t("关于青禾与常见问题")}</PageLink>
              <PageLink page="orders" navigate={navigate}>{t("查看我的预购")}</PageLink>
              <PageLink page="help" navigate={navigate}>{t("帮助与食品援助")}</PageLink>
              <a href={officialMarketUrl} target="_blank" rel="noreferrer">{t("Rutgers 官方市场信息")}<ExternalLink size={12} />
              </a>
            </nav>
          </footer>
        </main>
      </div>
      {!retailer && (
        <nav className="mobile-site-nav" aria-label={t("手机快捷导航")} inert={mobileNav}>
          {clientNav.slice(0, 4).map((item) => (
            <PageLink
              key={item.id}
              page={item.id}
              navigate={navigate}
              active={page === item.id}
            >
              <item.icon size={20} />
              <span>{t(item.label)}</span>
            </PageLink>
          ))}
        </nav>
      )}
      <ScrollActions inert={mobileNav} count={cartCount} total={money(cartTotal)} onCart={() => setCartOpen(true)} page={page} retailer={retailer} />
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <CheckCircle2 size={19} />
          {t(toast.message)}
          <button aria-label={t("关闭提示")} onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {authOpen && (
        <AuthModal
          demo={config.demo}
          onClose={closeAuth}
          onLogin={onLogin}
          checkout={loginIntent === "cart"}
        />
      )}
      {cartOpen && (
        <CartModal
          cart={cart}
          products={products}
          config={config}
          user={user}
          draft={checkout}
          onDraftChange={setCheckout}
          onClose={closeCart}
          onLogin={() => {
            setCartOpen(false);
            setLoginIntent("cart");
            setAuthOpen(true);
          }}
          update={setCart}
          onSuccess={(order) => {
            setCart({});
            setCheckout({ slot: "", note: "" });
            setCartOpen(false);
            refresh();
            navigate("orders");
            notify({ message: "预购成功 · {id}", values: { id: order.id } });
          }}
        />
      )}
      {detail && (
        <Modal title={t("这份新鲜的故事")} onClose={closeDetail}>
          <div className={`detail-art art-bg-${detail.art}`}>
            <Produce kind={detail.art} />
            {detail.organic === 1 && (
              <span className="organic-badge">
                <Leaf size={12} />{t("有机种植 · 演示")}</span>
            )}
          </div>
          <div className="detail-copy">
            <span className="eyebrow">{t(detail.farm)}</span>
            <h2>{t(detail.name)}</h2>
            <p>{t(detail.description)}</p>
            <div className="detail-meta">
              <strong>
                {t(money(detail.price_cents))}
                <small> / {t(detail.unit)}</small>
              </strong>
              <span>{t("今日剩余 {count} {unit}", { count: detail.stock, unit: quantityUnit(language, detail.unit, detail.stock) })}
              </span>
            </div>
            <p className="helper-text">{t("称重类商品按标示单位预订；如需现场称重，最终金额请与商户确认。")}</p>
            <button
              className="button primary full-width"
              disabled={!detail.stock || retailer}
              onClick={() => add(detail)}
            >
              <ShoppingBag size={17} />
              {t(detail.stock ? "加入购物袋" : "今日已售罄")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProductCard({
  product: p,
  quantity,
  onAdd,
  onRemove,
  onView,
}: {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  onView: () => void;
}) {
  const { t, language } = useLanguage();
  const addRef = useRef<HTMLButtonElement>(null);
  return (
    <article className="product-card" data-product-id={p.id}>
      <button
        className={`product-image art-bg-${p.art}`}
        onClick={onView}
        aria-label={t("查看{0}", {0: t(p.name)})}
      >
        <Produce kind={p.art} />
        {p.organic === 1 && (
          <span className="organic-badge">
            <Leaf size={11} />{t("有机种植")}</span>
        )}
        {p.stock === 0 && <span className="sold-out">{t("今日售罄")}</span>}
        <span className="view-product">{t("了解这份新鲜")}<ArrowUpRight size={14} />
        </span>
      </button>
      <div className="product-copy">
        <div className="farm-label">
          <span className="tiny-dot" />
          {t(p.farm)}
        </div>
        <button className="product-name" onClick={onView}>
          {t(p.name)}
        </button>
        <div className="product-description">
          {t(p.description).split(/[。.!?]/)[0]}
        </div>
        <div className="product-bottom">
          <div>
            <strong>{t(money(p.price_cents))}</strong>
            <small> / {t(p.unit)}</small>
            <span className={`stock-label ${p.stock < 10 ? "low" : ""}`}>
              {p.stock > 0 ? t("剩余 {count} {unit}", { count: p.stock, unit: quantityUnit(language, p.unit, p.stock) }) : t("等待下一次采收")}
            </span>
          </div>
          <div className={quantity ? "product-quantity" : "product-add"}>
            {quantity > 0 && <>
              <button className="add-button remove-button" onClick={() => { if (quantity === 1) addRef.current?.focus(); onRemove(); }} aria-label={t("减少{0}", { 0: t(p.name) })}><Minus size={15} /></button>
              <span aria-live="polite" aria-atomic="true"><span className="quantity-pop" key={quantity}>{quantity}</span></span>
            </>}
            <button
              ref={addRef}
              className={`add-button ${quantity ? "has-quantity" : ""}`}
              disabled={!p.stock || quantity >= p.stock}
              aria-label={t("将{0}加入购物袋", {0: t(p.name)})}
              onClick={onAdd}
            ><Plus size={quantity ? 15 : 20} /></button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AuthModal({
  demo,
  onClose,
  onLogin,
  checkout = false,
}: {
  demo: boolean;
  onClose: () => void;
  onLogin: (user: User) => void;
  checkout?: boolean;
}) {
  const { t } = useLanguage();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>("");
  const submit = async (e?: FormEvent, role?: Role) => {
    e?.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const input = role
        ? { email: `${role}@qinghe.demo`, password: "MarketDemo2026!" }
        : { email, password, ...(register ? { name } : {}) };
      const result = await api<{ user: User }>(
        register && !role ? "/auth/register" : "/auth/login",
        { method: "POST", body: JSON.stringify(input) },
      );
      onLogin(result.user);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t(register ? "加入青禾社区" : "你好，欢迎来到青禾")}
      onClose={onClose}
      busy={busy}
    >
      <p className="modal-intro">
        {t(checkout
          ? "购物袋、自提时段和备注已保留。登录顾客账号后继续确认，不会自动下单。"
          : "一个账号，连接附近的好食物与好邻里。")}
      </p>
      {demo && (
        <div className="demo-login">
          <span className="eyebrow">{t("体验完整的双端流程")}</span>
          <div>
            <button
              className="demo-account"
              disabled={busy}
              onClick={() => void submit(undefined, "client")}
            >
              <ShoppingBag size={22} />
              <strong>{t("顾客端演示")}</strong>
              <small>{t("逛市集 · 预购自提")}</small>
              <ArrowRight size={16} />
            </button>
            <button
              className="demo-account"
              disabled={busy}
              onClick={() => void submit(undefined, "retailer")}
            >
              <Store size={22} />
              <strong>{t("商户端演示")}</strong>
              <small>{t("管商品 · 处理订单")}</small>
              <ArrowRight size={16} />
            </button>
          </div>
          <p>{t("演示账号仅供体验，请勿填写真实个人信息。")}</p>
        </div>
      )}
      <div className="divider">
        <span>{t(register ? "或使用邮箱注册" : "或使用邮箱登录")}</span>
      </div>
      <form onSubmit={submit} className="form-stack">
        <fieldset className="form-fields form-stack" disabled={busy}>
          {register && (
            <label>{t("称呼")}<input
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder={t("我们该怎么称呼你")}
              />
            </label>
          )}
          <label>{t("邮箱地址")}<input
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>{t("密码")}<input
              required
              type="password"
              minLength={register ? 10 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder={t(register ? "至少 10 个字符" : "输入你的密码")}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
          <button className="button primary full-width" disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : null}
            {t(busy ? (register ? "正在创建账号…" : "正在连接账号…") : register ? "创建顾客账号" : "登录")}
            <ArrowRight size={16} />
          </button>
        </fieldset>
      </form>
      <p className="auth-toggle">
        {t(register ? "已有账号？" : "第一次来？")}
        <button
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {t(register ? "前往登录" : "注册顾客账号")}
        </button>
      </p>
    </Modal>
  );
}

function CartModal({
  cart,
  products,
  config,
  user,
  onClose,
  onLogin,
  update,
  onSuccess,
  draft,
  onDraftChange,
}: {
  cart: Cart;
  products: Product[];
  config: Config;
  user: User | null;
  onClose: () => void;
  onLogin: () => void;
  update: (cart: Cart) => void;
  onSuccess: (order: Order) => void;
  draft: CheckoutDraft;
  onDraftChange: (draft: CheckoutDraft) => void;
}) {
  const { t, language } = useLanguage();
  const slot = config.pickupSlots.includes(draft.slot)
    ? draft.slot
    : (config.pickupSlots[0] ?? "");
  const { note } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>("");
  const entries = Object.entries(cart).map(([id, quantity]) => ({
    id: Number(id),
    product: products.find((p) => p.id === Number(id)),
    quantity,
  }));
  const total = entries.reduce(
    (sum, item) => sum + (item.product?.price_cents ?? 0) * item.quantity,
    0,
  );
  const invalid = entries.some(
    (item) => !item.product || item.quantity > (item.product?.stock ?? 0),
  );
  const change = (id: number, quantity: number) => {
    const next = { ...cart };
    if (quantity <= 0) delete next[id];
    else next[id] = quantity;
    update(next);
    setError("");
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || invalid || !slot) return;
    if (!user) return onLogin();
    setBusy(true);
    setError("");
    try {
      const order = await api<Order>("/orders", {
        method: "POST",
        body: JSON.stringify({
          items: Object.entries(cart).map(([id, quantity]) => ({
            productId: Number(id),
            quantity,
          })),
          pickupSlot: slot,
          note,
        }),
      });
      onSuccess(order);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("我的新鲜购物袋")} onClose={onClose} busy={busy}>
      {!entries.length ? (
        <Empty
          title={t("购物袋在等一份新鲜")}
          text={t("挑选喜欢的蔬菜，提前预购，到市集轻松取。")}
          action={
            <button className="button primary" onClick={onClose}>{t("继续逛逛")}<ArrowRight size={16} />
            </button>
          }
        />
      ) : (
        <form onSubmit={submit}>
          <fieldset className="form-fields" disabled={busy}>
            <div className="cart-list">
              {entries.map(({ id, product: p, quantity }) => (
                <div className="cart-item" key={id}>
                  {p ? (
                    <>
                      <div className={`cart-art art-bg-${p.art}`}>
                        <Produce kind={p.art} />
                      </div>
                      <div className="cart-item-info">
                        <strong>{t(p.name)}</strong>
                        <small>
                          {t(money(p.price_cents))} / {t(p.unit)}
                        </small>
                        <div className="quantity-control">
                          <button
                            type="button"
                            aria-label={t("减少{0}", {0: t(p.name)})}
                            onClick={() => change(p.id, quantity - 1)}
                          >
                            <Minus size={13} />
                          </button>
                          <span>{quantity}</span>
                          <button
                            type="button"
                            aria-label={t("增加{0}", {0: t(p.name)})}
                            disabled={quantity >= p.stock}
                            onClick={() => change(p.id, quantity + 1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        {quantity > p.stock && (
                          <div className="stock-warning" role="status">
                            <span>{t("当前仅剩 {count} {unit}", { count: p.stock, unit: quantityUnit(language, p.unit, p.stock) })}
                            </span>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => change(p.id, p.stock)}
                            >
                              {t(p.stock > 0 ? "调整至可购数量" : "移除售罄商品")}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="cart-line-total">
                        <strong>{t(money(p.price_cents * quantity))}</strong>
                        <button
                          type="button"
                          aria-label={t("移除{0}", {0: t(p.name)})}
                          onClick={() => change(p.id, 0)}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{t("商品已下架，请移除后继续预购。")}</p>
                      <button type="button" onClick={() => change(id, 0)}>{t("移除")}</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="pickup-box">
              <div>
                <Store size={17} />
                <strong>{t("市集自提 · 到场付款")}</strong>
              </div>
              <p>{t(config.today)}{t(" · 美国东部时间")}</p>
              <label>{t("选择自提时段")}<select
                  value={slot}
                  onChange={(e) =>
                    onDraftChange({ ...draft, slot: e.target.value })
                  }
                >
                  {config.pickupSlots.map((s) => (
                    <option value={s} key={s}>{t(s)}</option>
                  ))}
                </select>
              </label>
              <label>{t("给农场的小纸条 ")}<span>{t("（选填）")}</span>
                <textarea
                  maxLength={300}
                  rows={2}
                  placeholder={t("有什么需要我们提前知道的吗？")}
                  value={note}
                  onChange={(e) =>
                    onDraftChange({ ...draft, note: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="cart-total">
              <span>{t("预计合计 ")}<small>USD</small>
              </span>
              <strong>{t(money(total))}</strong>
            </div>
            <p className="helper-text">{t("预购会为你保留库存；订单确认后请按时自提。此版本不收取线上款项。价格以提交订单时的服务端报价为准。")}</p>
            {invalid && (
              <p className="form-error" role="alert">{t("商品或库存已变化，请按上方提示调整购物袋后提交。")}</p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {t(error)}
              </p>
            )}
            {!slot && (
              <p className="form-error" role="alert">{t("当前暂无可用自提时段，请稍后再来。")}</p>
            )}
            <button
              className="button primary full-width"
              disabled={busy || invalid || !slot || user?.role === "retailer"}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <ShoppingBag size={17} />
              )}{t(" ")}
              {t(busy
                ? "正在提交预购，请稍候…"
                : user
                  ? "Place preorder"
                  : "登录后预购")}
              <ArrowRight size={16} />
            </button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}

function Prices({
  products,
  revision,
}: {
  products: Product[];
  revision: number;
}) {
  const { t } = useLanguage();
  const [view, setView] = useState<"archive" | "forecast">("archive");
  return (
    <>
      <div className="category-tabs price-view-tabs" aria-label={t("价格资料类型")}>
        <button
          className={view === "archive" ? "selected" : ""}
          onClick={() => setView("archive")}
        >{t("Externship 采价档案")}</button>
        <button
          className={view === "forecast" ? "selected" : ""}
          onClick={() => setView("forecast")}
        >{t("演示价格趋势与预测")}</button>
      </div>
      {view === "archive" ? (
        <ReferencePrices />
      ) : (
        <ForecastPrices products={products} revision={revision} />
      )}
    </>
  );
}

function ForecastPrices({
  products,
  revision,
}: {
  products: Product[];
  revision: number;
}) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(products[0]?.id ?? 0);
  const [data, setData] = useState<PriceData>();
  const [error, setError] = useState<Message>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setBusy(true);
    setError("");
    api<PriceData>(`/products/${selected}/prices`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, revision]);
  if (!products.length)
    return (
      <Empty
        icon={<BarChart3 />}
        title={t("还没有可观察的价格")}
        text={t("商品上架后，可以查看已记录的历史价格与预测。")}
      />
    );
  const first = data?.history[0]?.price_cents ?? 0;
  const latest = data?.history.at(-1)?.price_cents ?? 0;
  const change = first ? ((latest - first) / first) * 100 : 0;
  const chart: {
    date: string;
    actual?: number;
    predicted?: number;
    range?: [number, number];
  }[] =
    data?.history.map((h) => ({ date: h.date, actual: h.price_cents / 100 })) ??
    [];
  if (data?.forecast.points.length) {
    chart[chart.length - 1] = {
      ...chart[chart.length - 1],
      predicted: latest / 100,
    };
    chart.push(
      ...data.forecast.points.map((p) => ({
        date: p.date,
        predicted: p.price_cents / 100,
        range: [p.low_cents / 100, p.high_cents / 100] as [number, number],
      })),
    );
  }
  return (
    <>
      <div className="price-toolbar">
        <div className="price-selector">
          <span>{t("选择观察蔬菜")}</span>
          <select
            aria-label={t("选择观察蔬菜")}
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {products.map((p) => (
              <option value={p.id} key={p.id}>
                {t("{product} · 每{unit}", { product: t(p.name), unit: { unit: p.unit, count: 1 } })}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </div>
        <span className="helper-text">{t("价格单位：美元（USD） / 商品标示单位")}</span>
      </div>
      {error ? (
        <div className="error-panel" role="alert">
          {t(error)}
          <button
            className="text-button"
            onClick={() => setSelected(products[0].id)}
          >{t("查看首个商品")}</button>
        </div>
      ) : busy ? (
        <div className="loading-panel">
          <LoaderCircle className="spin" />{t("正在分析价格记录…")}</div>
      ) : (
        data && (
          <>
            <div className="stat-grid price-stat-grid">
              <Stat
                label={t("当前售价")}
                value={money(data.product.price_cents)}
                note={t("每{0} · 最新记录 {1}", {0: { unit: data.product.unit, count: 1 }, 1: t(shortDate(data.history.at(-1)?.date ?? ""))})}
                icon={<Wallet />}
              />
              <Stat
                label={t("历史期间变化")}
                value={`${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
                note={t("对比 {0} 首条记录", {0: t(shortDate(data.history[0]?.date ?? ""))})}
                icon={change > 0 ? <ArrowUpRight /> : <ArrowDownRight />}
              />
              <Stat
                label={t("7 天后预测")}
                value={
                  data.forecast.points.length
                    ? money(data.forecast.points.at(-1)!.price_cents)
                    : "数据不足"
                }
                note={t("模型估算，不代表实际成交价")}
                icon={<TrendingUp />}
              />
              <Stat
                label={t("回测平均绝对误差")}
                value={
                  data.forecast.maeCents !== null
                    ? money(data.forecast.maeCents)
                    : "—"
                }
                note={t("{0} 条历史记录 · 滚动单步回测", {0: data.forecast.sampleSize})}
                icon={<BarChart3 />}
              />
            </div>
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{t("PRODUCE PRICES AT A GLANCE")}</span>
                  <h2>{t("{product} · 价格走势", { product: t(data.product.name) })}</h2>
                </div>
                <div className="chart-legend">
                  <span>
                    <i />{t("历史价格")}</span>
                  <span>
                    <i className="predicted" />{t("趋势预测")}</span>
                </div>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chart}
                    margin={{ top: 20, right: 18, left: 0, bottom: 12 }}
                  >
                    <defs>
                      <linearGradient
                        id="priceFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#718b67"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="100%"
                          stopColor="#718b67"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="#eceee6"
                      strokeDasharray="4 4"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      tick={{ fontSize: 11, fill: "#8a9084" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={35}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fontSize: 11, fill: "#8a9084" }}
                      axisLine={false}
                      tickLine={false}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      labelFormatter={(v) => `${v}`}
                      formatter={(value, name) => [
                        Array.isArray(value)
                          ? `${money(Number(value[0]) * 100)} – ${money(Number(value[1]) * 100)}`
                          : money(Number(value) * 100),
                        name === "actual"
                          ? t("历史价格")
                          : name === "range"
                            ? t("估计区间")
                            : t("趋势预测"),
                      ]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e6e9df",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="range"
                      fill="#e4c9a3"
                      fillOpacity={0.25}
                      stroke="none"
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      stroke="#53764f"
                      strokeWidth={2.5}
                      fill="url(#priceFill)"
                    />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      stroke="#c7975a"
                      strokeWidth={2.5}
                      strokeDasharray="6 5"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="forecast-note">
                <TrendingUp size={19} />
                <div>
                  <strong>{t(data.forecast.method)}</strong>
                  <p>
                    {t(data.forecast.message)}{t(" ")}{t("演示模式下的历史记录为生成的示例数据。")}</p>
                </div>
              </div>
            </section>
            <section className="panel forecast-table">
              <div className="panel-heading">
                <h3>{t("未来 7 天参考价格")}</h3>
                <span className="muted">{t("含模型估计区间")}</span>
              </div>
              {data.forecast.points.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("日期")}</th>
                        <th>{t("参考价格 / ")}{t(data.product.unit)}</th>
                        <th>{t("估计区间")}</th>
                        <th>{t("相对当前售价")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.forecast.points.map((p) => (
                        <tr key={p.date}>
                          <td>{t(p.date)}</td>
                          <td>
                            <strong>{t(money(p.price_cents))}</strong>
                          </td>
                          <td>
                            {t(money(p.low_cents))} – {t(money(p.high_cents))}
                          </td>
                          <td>
                            <span
                              className={
                                p.price_cents <= latest
                                  ? "trend-down"
                                  : "trend-up"
                              }
                            >
                              {t(p.price_cents > latest ? "+" : "")}
                              {t(money(p.price_cents - latest))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="helper-text">{t("积累至少 7 天的价格记录后显示预测结果。")}</p>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}

function Orders({
  user,
  revision,
  refresh,
  notify,
  onLogin,
  onShop,
}: {
  user: User | null;
  revision: number;
  refresh: () => void;
  notify: (s: Message) => void;
  onLogin: () => void;
  onShop: () => void;
}) {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Message>("");
  const [busy, setBusy] = useState("");
  const [cancelOrder, setCancelOrder] = useState<Order>();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    api<Order[]>("/orders")
      .then((d) => {
        if (!cancelled) setOrders(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, revision]);
  const closeCancel = useCallback(() => setCancelOrder(undefined), []);
  const update = async (order: Order, status: OrderStatus) => {
    if (busy) return;
    setBusy(order.id);
    try {
      await api(`/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setCancelOrder(undefined);
      refresh();
      notify(
        status === "cancelled"
          ? "订单已取消，库存已归还"
          : status === "confirmed"
            ? "订单已确认，请等待顾客自提"
            : "订单已完成",
      );
    } catch (e) {
      notify(e as Error);
    } finally {
      setBusy("");
    }
  };
  if (!user)
    return (
      <Empty
        title={t("登录，查看你的新鲜预购")}
        text={t("订单、取货时段和状态，会在这里为你妥善记录。")}
        action={
          <button className="button primary" onClick={onLogin}>{t("登录 / 注册")}<ArrowRight size={16} />
          </button>
        }
      />
    );
  const visible = orders.filter((o) => filter === "all" || o.status === filter);
  return (
    <>
      <div className="order-tabs category-tabs">
        <button
          className={filter === "all" ? "selected" : ""}
          onClick={() => setFilter("all")}
        >{t("全部订单 ")}<span>{orders.length}</span>
        </button>
        {Object.entries(statusLabels).map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "selected" : ""}
            onClick={() => setFilter(key)}
          >
            {t(label)} <span>{orders.filter((o) => o.status === key).length}</span>
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading-panel">
          <LoaderCircle className="spin" />{t("正在读取预购订单…")}</div>
      ) : error ? (
        <div className="error-panel" role="alert">
          {t(error)}
          <button className="text-button" onClick={refresh}>{t("重新加载")}</button>
        </div>
      ) : !visible.length ? (
        <Empty
          title={t(filter === "all" ? "还没有新鲜预购" : "这个状态下还没有订单")}
          text={
            t(user.role === "client"
              ? "去看看今日的蔬菜，为下一餐挑一点新鲜。"
              : "顾客提交预购后，你可以在这里确认订单并安排自提。")
          }
          action={
            user.role === "client" ? (
              <button className="button primary" onClick={onShop}>{t("逛逛今日市集")}<ArrowRight size={16} />
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="orders-list">
          {visible.map((o) => (
            <article className="panel order-card" key={o.id}>
              <div className="order-card-top">
                <div>
                  <strong>{t(o.id)}</strong>
                  <span>
                    {t(o.created_at
                      .replace(" ", "T")
                      .slice(0, 16)
                      .replace("T", " "))}{t(" ")}
                    UTC
                  </span>
                </div>
                <span className={`status-badge status-${o.status}`}>
                  <span />
                  {t(statusLabels[o.status])}
                </span>
              </div>
              <div className="order-items">
                {o.items.map((item) => (
                  <div key={item.product_id}>
                    <span>
                      {t(item.name)}
                      <small>
                        {t(money(item.price_cents))} / {t(item.unit)}
                      </small>
                    </span>
                    <span>
                      × {item.quantity}
                      <strong>{t(money(item.price_cents * item.quantity))}</strong>
                    </span>
                  </div>
                ))}
              </div>
              <div className="order-pickup">
                <MapPin size={16} />
                <span>
                  {t(o.pickup_date)} · {t(o.pickup_slot)} ET
                </span>
                <span className="order-client">
                  <Users size={15} />
                  {o.client_name}
                </span>
              </div>
              {o.note && <p className="order-note">{t("备注：")}{o.note}</p>}
              <div className="order-card-bottom">
                <span>{t("到场付款 · 共 {count} 件", { count: o.items.reduce((a, i) => a + i.quantity, 0) })}<strong>{t(money(o.total_cents))}</strong>
                </span>
                <div>
                  {(o.status === "pending" ||
                    (o.status === "confirmed" && user.role === "retailer")) && (
                    <button
                      className="button subtle"
                      disabled={!!busy}
                      onClick={() => setCancelOrder(o)}
                    >{t("取消订单")}</button>
                  )}
                  {user.role === "retailer" && o.status === "pending" && (
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => void update(o, "confirmed")}
                    >
                      {busy === o.id ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      {t(busy === o.id ? "正在确认…" : "Accept preorder")}
                    </button>
                  )}
                  {user.role === "retailer" && o.status === "confirmed" && (
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => void update(o, "completed")}
                    >
                      {busy === o.id ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {t(busy === o.id ? "正在更新…" : "确认已自提并收款")}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {cancelOrder && (
        <Modal title={t("取消这份预购？")} onClose={closeCancel} busy={!!busy}>
          <p className="modal-intro">{t("订单 {id} 取消后，预留库存会自动归还。已取消订单无法恢复。", { id: cancelOrder.id })}</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={closeCancel}
              disabled={!!busy}
            >{t("保留订单")}</button>
            <button
              className="button danger"
              disabled={!!busy}
              onClick={() => void update(cancelOrder, "cancelled")}
            >
              {t(busy ? "正在取消…" : "确认取消")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="stat-card">
      <div className="stat-label">
        {t(label)}
        <span>{icon}</span>
      </div>
      <strong className="stat-value">{t(value)}</strong>
      <p>{t(note)}</p>
    </div>
  );
}
function RetailDashboard({
  revision,
  navigate,
  notify,
}: {
  revision: number;
  navigate: (p: Page) => void;
  notify: (s: Message) => void;
}) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState<Message>("");
  useEffect(() => {
    let cancelled = false;
    api<Dashboard>("/retailer/dashboard")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  if (error)
    return (
      <div className="error-panel" role="alert">
        {t(error)}
      </div>
    );
  if (!data)
    return (
      <div className="loading-panel">
        <LoaderCircle className="spin" />{t("正在汇总经营数据…")}</div>
    );
  return (
    <>
      <section className="retailer-welcome">
        <div>
          <span className="eyebrow">{t("GOOD FOOD STARTS WITH YOU")}</span>
          <h2>{t("每一份用心，\n都有一张餐桌在等待。")}</h2>
          <p>{t("今天也一起，让社区的餐桌更丰富一点。")}</p>
          <button
            className="button primary"
            onClick={() => navigate("inventory")}
          >{t("管理今日商品")}<ArrowRight size={17} />
          </button>
        </div>
        <BasketArt />
      </section>
      <div className="stat-grid">
        <Stat
          label={t("今日预购订单")}
          value={String(data.todayOrders)}
          note={t("{0} 笔订单等待确认（含往日）", {0: data.pending})}
          icon={<ShoppingBag />}
        />
        <Stat
          label={t("今日已完成金额")}
          value={money(data.revenueCents)}
          note={t("仅统计已自提并收款的订单")}
          icon={<Wallet />}
        />
        <Stat
          label={t("今日待履约金额")}
          value={money(data.reservedCents)}
          note={t("待确认与待自提订单合计")}
          icon={<Truck />}
        />
        <Stat
          label={t("今日在售商品")}
          value={String(data.activeProducts)}
          note={t("{0} 款商品库存低于 10", {0: data.lowStock.length})}
          icon={<Package />}
        />
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <h3>{t("最近的预购")}</h3>
            <button className="text-button" onClick={() => navigate("orders")}>{t("查看全部")}<ArrowRight size={15} />
            </button>
          </div>
          {data.recentOrders.length ? (
            <div className="recent-orders">
              {data.recentOrders.map((o) => (
                <button key={o.id} onClick={() => navigate("orders")}>
                  <span className="recent-order-icon">
                    <ShoppingBag size={18} />
                  </span>
                  <span>
                    <strong>{o.client_name}</strong>
                    <small>
                      {t("{id} · {count} 款商品", { id: o.id, count: o.items.length })}</small>
                  </span>
                  <span>
                    <strong>{t(money(o.total_cents))}</strong>
                    <small>{t(statusLabels[o.status])}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title={t("新鲜订单，很快相见")}
              text={t("你的商品已展示给社区顾客，收到预购后会出现在这里。")}
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>{t("库存小提醒")}</h3>
            <span className="eyebrow">{t("STOCK WATCH")}</span>
          </div>
          {data.lowStock.length ? (
            data.lowStock.map((p) => (
              <button
                className="stock-warning"
                key={p.id}
                onClick={() => navigate("inventory")}
              >
                <Produce kind={p.art} />
                <span>
                  <strong>{t(p.name)}</strong>
                  <small>{t("剩余 {count} {unit}", { count: p.stock, unit: quantityUnit(language, p.unit, p.stock) })}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <div className="stock-all-good">
              <CheckCircle2 size={34} />
              <h3>{t("库存状态良好")}</h3>
              <p>{t("暂无低库存商品，记得及时核对现场销售。")}</p>
            </div>
          )}
          <button
            className="button secondary full-width"
            onClick={() => {
              notify("在商品与库存中可以调整每款商品的数量");
              navigate("inventory");
            }}
          >{t("检查商品与库存")}<ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}

function Inventory({
  today,
  revision,
  refresh,
  notify,
}: {
  today: string;
  revision: number;
  refresh: () => void;
  notify: (s: Message) => void;
}) {
  const { t, language } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Message>("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    let cancelled = false;
    setError("");
    api<Product[]>("/retailer/products")
      .then((d) => {
        if (!cancelled) setProducts(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const close = useCallback(() => setEditing(undefined), []);
  const shown = products.filter((p) => matchesSearch(search, p.name));
  return (
    <>
      <div className="inventory-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder={t("搜索商品名称…")}
            aria-label={t("搜索库存商品")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="button primary" onClick={() => setEditing(null)}>
          <Plus size={17} />{t("上架新商品")}</button>
      </div>
      <div className="panel inventory-panel">
        {loading ? (
          <div className="loading-panel">
            <LoaderCircle className="spin" />{t("正在读取库存…")}</div>
        ) : error ? (
          <div className="error-panel" role="alert">
            {t(error)}
          </div>
        ) : !shown.length ? (
          <Empty
            icon={<Sprout />}
            title={t("这里还没有商品")}
            text={t("上架一份新鲜，让社区的顾客看见它。")}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("商品信息")}</th>
                  <th>{t("分类")}</th>
                  <th>{t("单价")}</th>
                  <th>{t("可预购库存")}</th>
                  <th>{t("售卖日期")}</th>
                  <th>{t("状态")}</th>
                  <th>{t("操作")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="inventory-product">
                        <div className={`mini-art art-bg-${p.art}`}>
                          <Produce kind={p.art} />
                        </div>
                        <div>
                          <strong>{t(p.name)}</strong>
                          <small>{t(p.organic ? "有机种植" : "当季新鲜")}</small>
                        </div>
                      </div>
                    </td>
                    <td>{t(p.category)}</td>
                    <td>
                      <strong>{t(money(p.price_cents))}</strong>
                      <small> / {t(p.unit)}</small>
                    </td>
                    <td>
                      <span
                        className={p.stock < 10 ? "stock-low" : "stock-normal"}
                      >
                        {p.stock} {quantityUnit(language, p.unit, p.stock)}
                      </span>
                    </td>
                    <td>{t(p.available_date)}</td>
                    <td>
                      <span
                        className={`status-badge ${p.active && p.available_date === today ? "status-confirmed" : "status-cancelled"}`}
                      >
                        {t(!p.active
                          ? "已下架"
                          : p.available_date === today
                            ? "今日在售"
                            : "非今日售卖")}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditing(p)}
                      >{t("编辑")}<ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="helper-text inventory-help">{t("库存为当前可预购数量；提交预购时自动扣减，取消订单时自动归还。价格与库存以数据库记录为准。")}</p>
      {editing !== undefined && (
        <ProductEditor
          product={editing}
          today={today}
          onClose={close}
          onSaved={() => {
            close();
            refresh();
            notify(editing ? "商品已更新" : "新商品已上架");
          }}
        />
      )}
    </>
  );
}
function ProductEditor({
  product: p,
  today,
  onClose,
  onSaved,
}: {
  product: Product | null;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(p?.name ?? "");
  const [category, setCategory] = useState(p?.category ?? "叶菜类");
  const [art, setArt] = useState(p?.art ?? "lettuce");
  const [unit, setUnit] = useState(p?.unit ?? "磅");
  const [price, setPrice] = useState(p ? String(p.price_cents / 100) : "");
  const [stock, setStock] = useState(p?.stock ?? 0);
  const [date, setDate] = useState(p?.available_date ?? today);
  const [description, setDescription] = useState(p?.description ?? "");
  const [organic, setOrganic] = useState(!!p?.organic);
  const [active, setActive] = useState(p ? !!p.active : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(p ? `/retailer/products/${p.id}` : "/retailer/products", {
        method: p ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          category,
          art,
          unit,
          price_cents: Math.round(Number(price) * 100),
          stock,
          available_date: date,
          description,
          organic,
          active,
        }),
      });
      onSaved();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t(p ? "编辑这份新鲜" : "上架一份新鲜")}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={save} className="form-stack">
        <fieldset className="form-fields form-stack" disabled={busy}>
          <label>{t("商品名称")}<input
              required
              maxLength={50}
              value={t(name)}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("例如：刚采收的田园番茄")}
            />
          </label>
          <div className="form-row">
            <label>{t("蔬菜分类")}<select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {["叶菜类", "根茎类", "果实类"].map((c) => (
                  <option value={c} key={c}>{t(c)}</option>
                ))}
              </select>
            </label>
            <label>{t("商品插画")}<select value={art} onChange={(e) => setArt(e.target.value)}>
                {Object.entries({
                  tomato: "番茄",
                  broccoli: "西兰花",
                  carrot: "胡萝卜",
                  lettuce: "生菜",
                  pumpkin: "南瓜",
                  cucumber: "黄瓜",
                  potato: "土豆",
                  onion: "洋葱",
                }).map(([k, v]) => (
                  <option value={k} key={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>{t("售价（USD）")}<input
                required
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>{t("计价单位")}<select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {["磅", "颗", "把", "个", "袋"].map((u) => (
                  <option value={u} key={u}>{t(u)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>{t("可预购库存")}<input
                required
                type="number"
                min="0"
                max="10000"
                step="1"
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
              />
            </label>
            <label>{t("售卖日期（美国东部）")}<input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <label>{t("关于这份新鲜")}<textarea
              maxLength={500}
              rows={3}
              value={t(description)}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("介绍产地、口感或推荐做法…")}
            />
          </label>
          <div className="form-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={organic}
                onChange={(e) => setOrganic(e.target.checked)}
              />{t("有机种植")}</label>
            <label>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />{t("上架展示")}</label>
          </div>
          <p className="helper-text">{t("售卖日期为今天且已上架的商品，才会出现在顾客端。今日调价会更新今日历史价格记录。")}</p>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
          <button className="button primary full-width" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            {t(busy ? "正在保存…" : "保存商品")}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}

export default App;
