import { LanguageSwitcher, useLanguage, type Message } from "./i18n";
import { matchesSearch, quantityUnit } from "./translations/translate";
import { previewRecordEnglish, translatePreviewContent } from "./translations/preview";
import {
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  ChevronRight,
  ExternalLink,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  Monitor,
  Minus,
  Package,
  Plus,
  Search,
  School,
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
import { api, money } from "./api";
import { BasketArt, Produce } from "./Produce";
import MarketGuide, { HelpCenter } from "./MarketGuide";
import { NextMarketHero } from "./MarketVisit";
import { Inbox, VendorPortal } from "./WorkflowPortal";
import { OrderAdjustmentPanel } from "./OrderAdjustment";
import { SessionDirectory } from './SessionDirectory';
import { officialMarketUrl } from "./marketReference";
import Stat from "./Stat";
import { PageBoundary } from "./PageBoundary";
import { PageLink, useNavigation, type Page } from "./navigation";
import { AboutMarket } from "./VisitorGuide";
import { VisitorHeader, VisitorFooter, visitorNav as clientNav } from "./VisitorNavigation";
const SchoolAdmin = lazy(() => import("./SchoolAdmin"));
const Prices = lazy(() => import("./Prices"));
const SchoolScreen = lazy(() => import("./SchoolScreen"));
import { SnapCheckout, SnapFoodLabel, SnapOrderPlan } from "./SnapProgram";
import { PickupForm } from "./SchoolOperations";
import { canRestoreShoppingDraft, readShoppingDraft, saveShoppingDraft, shoppingToday, type Cart, type CheckoutDraft } from "./shoppingDraft";
import type {
  Config,
  Dashboard,
  Market,
  Order,
  OrderStatus,
  Product,
  Role,
  User,
} from "./types";

const statusLabels: Record<OrderStatus, string> = {
  pending: "待商户确认",
  confirmed: "待到场自提",
  completed: "已完成",
  cancelled: "已取消",
};
const retailerNav = [
  { id: "dashboard", label: "经营概览", icon: BarChart3 },
  { id: "inventory", label: "商品与库存", icon: Sprout },
  { id: "orders", label: "预购订单", icon: ShoppingBag },
  { id: "prices", label: "价格观察", icon: TrendingUp },
  { id: "help", label: "帮助与食品援助", icon: Leaf },
  { id: "vendor", label: "商户服务", icon: Store },
  { id: "notifications", label: "通知", icon: ClipboardList },
] as const;
const schoolNav = [
  { id: "school-screen", label: "管理大屏", icon: Monitor },
  { id: "school-operations", label: "现场运营", icon: ClipboardList },
  { id: "school", label: "全盘概览", icon: BarChart3 },
  { id: "school-markets", label: "市场设置", icon: SlidersHorizontal },
  { id: "school-vendors", label: "商户总览", icon: Store },
  { id: "school-impact", label: "社区影响", icon: Users },
  { id: "school-community", label: "商户与运营", icon: ClipboardList },
  { id: "notifications", label: "通知", icon: ClipboardList },
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
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        if (busy) {
          e.preventDefault();
          ref.current?.focus();
          return;
        }
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
  }, [onClose, busy]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
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
            onClick={onClose}
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
  const { t } = useLanguage();
  const [config, setConfig] = useState<Config>();
  const [savedShopping] = useState(readShoppingDraft);
  const [shoppingDate, setShoppingDate] = useState(() => {
    const date=new URLSearchParams(window.location.search).get('date');
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date>=shoppingToday() && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date ? date : savedShopping?.date ?? shoppingToday();
  });
  const [shoppingMarket,setShoppingMarket]=useState(() => {const id=Number(new URLSearchParams(window.location.search).get('market'));return Number.isSafeInteger(id)&&id>0?String(id):'';});
  const [shoppingMarkets,setShoppingMarkets]=useState<Market[]>([]);
  const draftRestored = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const { page, navigate: changePage, replacePage } = useNavigation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Message>("");
  const [toast, setToast] = useState<Message>("");
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
  const filterOptions = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!filterOptions.current?.contains(event.target as Node)) filterOptions.current?.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && filterOptions.current?.open) {
        filterOptions.current.open = false;
        filterOptions.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  const retailer = user?.role === "retailer";
  const school = user?.role === "admin";
  const manager = retailer || school;
  const schoolPage = page === "school" || page.startsWith("school-");
  const notify = useCallback((message: Message) => setToast(message), []);
  const refresh = useCallback(() => {
    setRevision((r) => r + 1);
  }, []);
  const load = useCallback(async () => {
    setLoadError("");
    setLoading(true);
    try {
      const [c, u, p, markets] = await Promise.all([
        api<Config>("/config"),
        api<{ user: User | null }>("/auth/me"),
        api<Product[]>(`/products?date=${shoppingDate}${shoppingMarket?`&marketId=${shoppingMarket}`:''}`),
        api<Market[]>('/markets'),
      ]);
      setConfig(c);
      setUser(u.user);
      setProducts(p);
      setShoppingMarkets(markets);
      if (!draftRestored.current) {
        if (canRestoreShoppingDraft(savedShopping, u.user)) {
          setCart(savedShopping!.cart);
          setCheckout(savedShopping!.checkout);
        }
        draftRestored.current = true;
        setDraftReady(true);
      }
      if (u.user?.role === "retailer" && window.location.pathname === "/")
        replacePage("dashboard");
      if (u.user?.role === "admin" && window.location.pathname === "/")
        replacePage("school");
    } catch (e) {
      setLoadError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [replacePage, shoppingDate, shoppingMarket, savedShopping]);
  useEffect(() => {
    if (draftReady) saveShoppingDraft(shoppingDate, cart, checkout, user);
  }, [draftReady, shoppingDate, cart, checkout, user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (revision)
      api<Product[]>(`/products?date=${shoppingDate}${shoppingMarket?`&marketId=${shoppingMarket}`:''}`)
        .then(setProducts)
        .catch((e) => notify(e as Error));
  }, [revision, notify, shoppingDate,shoppingMarket]);
  useEffect(()=>{
    if(page!=='discover')return;
    const url=new URL(window.location.href);
    if(shoppingDate!==shoppingToday())url.searchParams.set('date',shoppingDate);else url.searchParams.delete('date');
    if(shoppingMarket)url.searchParams.set('market',shoppingMarket);else url.searchParams.delete('market');
    window.history.replaceState(window.history.state,'',url);
  },[shoppingDate,shoppingMarket,page]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  // Refresh the business date and listings when a long-running tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      api<Config>("/config")
        .then((next) => {
          setConfig(next);
          if (shoppingDate < next.today) {
            setCart({});
            setCheckout({ slot: "", note: "" });
            setShoppingDate(next.today);
          }
        })
        .catch(() => {});
      refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, shoppingDate]);
  const navigate = (next: Page) => {
    changePage(next);
    setMobileNav(false);
  };
  const onLogin = (next: User) => {
    setUser(next);
    const resetCart = next.role !== "client" || (user && user.id !== next.id);
    if (resetCart) {
      setCart({});
      setCheckout({ slot: "", note: "" });
    }
    setAuthOpen(false);
    setCartOpen(loginIntent === "cart" && !resetCart);
    navigate(
      next.role === "admin"
        ? schoolPage ? page as Page : "school"
        : next.role === "retailer"
        ? page === "inventory"
          ? "inventory"
          : "dashboard"
        : loginIntent === "orders"
          ? "orders"
          : page === "dashboard" || page === "inventory" || schoolPage || page === "not-found"
            ? "discover"
            : page,
    );
    setLoginIntent(null);
    refresh();
    notify(
      loginIntent === "cart" && !resetCart
        ? "登录成功，请确认自提信息后提交预购"
        : { message: "欢迎回来，{name}", values: { name: next.role === "admin" || next.role === "retailer" || Object.hasOwn(previewRecordEnglish, next.name) ? { message: next.name } : next.name } },
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
    if (manager) return;
    if ((cart[product.id] ?? 0) >= product.stock)
      return notify("已达到当前库存数量");
    const existing=products.find(p=>(cart[p.id]??0)>0);
    if(existing&&(existing.market_id!==product.market_id||existing.retailer_id!==product.retailer_id)) {
      notify('每份购物袋限同一市场与商户，请先结算或清空购物袋再选择其他商户。');return;
    }
    setCart((c) => ({ ...c, [product.id]: Math.round(Math.min(product.stock,100,(c[product.id] ?? 0) + 1)*1000)/1000 }));
    notify({ message: "{product} 已加入购物袋", values: { product: { message: product.name } } });
  };
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = products.reduce((sum, product) => sum + Math.round(product.price_cents * (cart[product.id] ?? 0)), 0);
  const reduceProduct = (id: number) => setCart((current) => {
    const next = { ...current };
    if ((next[id] ?? 0) <= 1) delete next[id]; else next[id]--;
    return next;
  });
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
  const nav = school ? schoolNav : retailer ? retailerNav : clientNav;
  const title = {
    discover: "逛逛市集",
    markets: "市场与导航",
    prices: "价格观察",
    orders: retailer ? "预购订单" : "我的预购",
    about: "关于青禾",
    help: "帮助与食品援助",
    vendor: "商户服务",
    notifications: "通知",
    dashboard: "经营概览",
    inventory: "商品与库存",
    school: "全盘概览",
    "school-screen": "管理大屏",
    "school-operations": "现场运营",
    "school-markets": "市场设置",
    "school-vendors": "商户总览",
    "school-impact": "社区影响",
    "school-community": "商户与运营",
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
    <div className={`app-shell ${school ? `school-site ${page === "school-screen" ? "school-screen-site" : ""}` : retailer ? "retailer-site" : "visitor-site"} ${cartCount ? "has-shopping-bag" : ""}`}>
      <a href="#main-content" className="skip-link">{t("跳到主要内容")}</a>
      {manager && mobileNav && (
        <button
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
          aria-label={t("关闭导航")}
        />
      )}
      {manager && <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <PageLink
          className="brand"
          page={school ? "school" : retailer ? "dashboard" : "discover"}
          navigate={navigate}
        >
          <span className="brand-symbol">
            <Leaf size={25} />
          </span>
          <span>
            <b>{t("青禾")}<span className="brand-english">QINGHE</span>
            </b>
            <small>RUTGERS FARMERS MARKET</small>
          </span>
        </PageLink>
        <div className="workspace-label">
          <span className="tiny-dot" />
          {t(school ? "UNIVERSITY · 学校管理方" : retailer ? "RETAILER · 商户工作台" : "CLIENT · 顾客空间")}
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
          <span>LOCAL FOOD. LOCAL GOOD.</span>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">{t(user ? user.name : "青").slice(0, 1)}</div>
          <div>
            <strong>{t(user?.name ?? "欢迎来到青禾")}</strong>
            <small>
              {t(user
                ? school ? "学校管理方" : retailer
                  ? "农场商户"
                  : "社区新鲜探索者"
                : "登录，开启新鲜日常")}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label={t(user ? "退出登录" : "登录")}
            onClick={() => (user ? void logout() : setAuthOpen(true))}
          >
            {user ? <LogOut size={17} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </aside>}
      <div className="main-shell">
        {!manager ? <VisitorHeader page={page} navigate={navigate} user={user} onLogin={() => setAuthOpen(true)} onLogout={() => void logout()} /> : <header className="topbar">
          <div className="breadcrumb">
            <button
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
              {t("切换账号")}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </header>}
        <main id="main-content" tabIndex={-1}><PageBoundary>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {t(school ? "A CAMPUS CONNECTED BY GOOD FOOD" : retailer
                  ? "GROW YOUR LOCAL BUSINESS"
                  : "A LITTLE FRESHNESS, EVERY DAY")}
              </div>
              <h1>
                {t(page === "discover" ? "今天，也要好好吃饭。" : title)}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {t(page === "discover"
                  ? "先看开市时间与地点，再把当季新鲜带回家。"
                  : schoolPage
                    ? "连接学校、市场与商户，看见每一份新鲜带来的社区价值。"
                  : page === "dashboard"
                    ? "照顾好每一份收获，让新鲜被更多人看见。"
                    : page === "inventory"
                      ? "今日上架、价格与库存，在这里轻松管理。"
                      : page === "markets"
                        ? "哪天开、几点开、在哪里，出发前一次看清。"
                        : page === "prices"
                          ? "看懂价格的变化，为每一次选择多一份参考。"
                          : page === "help"
                            ? "食品援助、使用指引与常见问题，陪你安心逛市集。"
                            : page === "about"
                              ? "从屏幕到餐桌，让新鲜和邻里更近一点。"
                              : "每一份期待，都值得新鲜抵达。")}
              </p>
            </div>
            {!manager && (
              <button
                className="button cart-button"
                onClick={() => setCartOpen(true)}
              >
                <ShoppingBag size={18} />{t("购物袋")}<span className="count-pill">{cartCount}</span>
              </button>
            )}
          </div>
          {config.demo && (
            <div className="demo-notice">
              <span className="demo-badge">DEMO</span>{t(" ")}{t("开市日历与地址来自官方公开资料；商品、库存与预购为演示。")}{retailer && t(" 商户修改会影响当前演示商品与订单。")}
            </div>
          )}
          {page === "discover" && (
            <>
              <NextMarketHero navigate={navigate} />
              <div className="shop-shortcuts">
                <a href="#today-produce">{t("挑选今日蔬菜")}<ArrowRight size={16} /></a>
                <PageLink page="about" navigate={navigate}>{t("了解预购流程")}<ChevronRight size={14} /></PageLink>
              </div>
              <div className="section-heading" id="today-produce">
                <div>
                  <span className="eyebrow">FRESH FROM THE FARM</span>
                  <h2>{shoppingDate===config.today?t("今日新鲜上架"):t("{date} 可预购商品",{date:shoppingDate})}{t(" ")}
                    <span className="subtle-count">
                      {t("{count} 款当季好物", { count: products.length })}</span>
                  </h2>
                </div>
                <span className="harvest-tag">
                  <span className="tiny-dot" />{shoppingDate===config.today?t("今日可预购"):shoppingDate}</span>
              </div>
              <label className="shopping-date-picker">{t("选择自提日期")}<input type="date" min={config.today} value={shoppingDate} onChange={(e) => { if (!e.target.value) return; if (cartCount && !window.confirm(t("更换自提日期会清空当前购物袋，是否继续？"))) return; setCart({}); setCheckout({ slot: "", note: "" }); setShoppingDate(e.target.value); }} /></label>
              <label className="shopping-date-picker">{t("选择购物市场")}<select value={shoppingMarket} onChange={e=>{if(cartCount&&!window.confirm(t('切换市场会清空购物袋，是否继续？')))return;setCart({});setCheckout({slot:'',note:''});setShoppingMarket(e.target.value);}}><option value="">{t('全部市场')}</option>{shoppingMarkets.map(m=><option key={m.id} value={m.id}>{t(m.name)}</option>)}</select></label>
              <SessionDirectory date={shoppingDate} marketId={shoppingMarket?Number(shoppingMarket):undefined} />
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
                  <details className="product-filter-options" ref={filterOptions}>
                    <summary data-active={sort !== "recommended" || inStock}><SlidersHorizontal size={16} />{t("筛选与排序")}{(sort !== "recommended" || inStock) && <span>•</span>}</summary>
                    <div className="product-filter-panel">
                      <label className="sort-select">{t("商品排序")}<select aria-label={t("商品排序")} value={sort} onChange={(event) => setSort(event.target.value)}>
                        <option value="recommended">{t("推荐排序")}</option><option value="price-up">{t("价格从低到高")}</option><option value="price-down">{t("价格从高到低")}</option>
                      </select></label>
                      <label><input type="checkbox" checked={inStock} onChange={(event) => setInStock(event.target.checked)} />{t("仅看有库存")}</label>
                      {(sort !== "recommended" || inStock) && <button className="text-button" onClick={() => { setSort("recommended"); setInStock(false); }}>{t("恢复默认")}</button>}
                    </div>
                  </details>
                </div>
              </div>
              <div className="results-meta">
                <span>{t("发现 {count} 款新鲜好物", { count: visible.length })}</span>
                {visible.length > 0 && (category !== "全部蔬菜" || search || sort !== "recommended" || inStock) && <button className="text-button" onClick={() => { setCategory("全部蔬菜"); setSearch(""); setSort("recommended"); setInStock(false); }}>{t("清除筛选")}</button>}
              </div>
              {visible.length ? (
                <div className="product-grid">
                  {visible.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={cart[product.id] ?? 0}
                      onAdd={() => add(product)}
                      onReduce={() => reduceProduct(product.id)}
                      onView={() => setDetail(product)}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<Search />}
                  title={
                    t(products.length ? "还没找到这份新鲜" : "{date} 暂无可预购商品",{date:shoppingDate})
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
                        setSearch("");
                        setCategory("全部蔬菜");
                        setInStock(false);
                        setSort("recommended");
                      }}
                    >
                      {t(products.length ? "清除筛选" : "查看市场目录")}
                    </button>
                  }
                />
              )}
            </>
          )}
          {page === "markets" && <MarketGuide />}
          {page === "help" && <HelpCenter />}
          {page === "vendor" && <VendorPortal user={user} onLogin={()=>setAuthOpen(true)} onUser={next=>{setUser(next);if(next.role!=="client"){setCart({});setCheckout({slot:"",note:""});}refresh();}} />}
          {page === "notifications" && <Inbox user={user} onLogin={()=>setAuthOpen(true)} navigate={navigate} />}
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
          {schoolPage && !school && <Empty
            icon={<School />}
            title={t("这里是学校管理工作台")}
            text={t("请登录学校管理方账号，查看全盘统计、管理市场并了解社区影响。")}
            action={<button className="button primary" onClick={() => setAuthOpen(true)}>
              {t("学校管理方登录")}<ArrowRight size={16} />
            </button>}
          />}
          {schoolPage && school && page === "school-screen" && <SchoolScreen demo={config.demo} />}
          {schoolPage && school && page !== "school-screen" && <SchoolAdmin key={user.id} page={page as Page} demo={config.demo}
            navigate={navigate} refresh={refresh} notify={notify} />}
          {!manager ? <VisitorFooter navigate={navigate} onManage={() => setAuthOpen(true)} /> : <footer className="site-footer">
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
              <PageLink page="school" navigate={navigate}>{t("学校管理入口")}</PageLink>
              <a href={officialMarketUrl} target="_blank" rel="noreferrer">{t("Rutgers 官方市场信息")}<ExternalLink size={12} />
              </a>
            </nav>
          </footer>}
        </PageBoundary></main>
      </div>
      {!manager && cartCount > 0 && <div className="shopping-bag-dock" hidden={cartOpen || authOpen || !!detail}>
        <button onClick={() => setCartOpen(true)} aria-label={t("查看购物袋，已选 {count} 件", { count: cartCount })}>
          <ShoppingBag size={20} /><span><strong>{t("查看购物袋")}<span className="bag-dock-count">{cartCount}</span></strong><small>{t("核对商品与自提安排")}</small></span>
          <b>{t(money(cartTotal))}</b><ChevronRight size={18} />
        </button>
      </div>}
      {!manager && (
        <nav className="mobile-site-nav" aria-label={t("手机快捷导航")}>
          {clientNav.map((item) => (
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
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {t(toast)}
          <button aria-label={t("关闭提示")} onClick={() => setToast("")}>
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
          onShop={() => { setCartOpen(false); navigate("discover"); requestAnimationFrame(() => document.getElementById("today-produce")?.scrollIntoView()); }}
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
            <SnapFoodLabel eligibility={detail.snap_eligibility} />
            <p className="helper-text">{t("食品资格不代表摊位接受 EBT，请在购物袋核对现场付款条件。")}</p>
            <div className="detail-meta">
              <strong>
                {t(money(detail.price_cents))}
                <small> / {t(detail.unit)}</small>
              </strong>
              <span>{t("今日剩余 {count} {unit}", { count: detail.stock, unit: { unit: detail.unit, count: detail.stock } })}
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
  onReduce,
  onView,
}: {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onReduce: () => void;
  onView: () => void;
}) {
  const { t } = useLanguage();
  const addButton = useRef<HTMLButtonElement>(null);
  return (
    <article className="product-card">
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
              {p.stock > 0 ? t("剩余 {count} {unit}", { count: p.stock, unit: { unit: p.unit, count: p.stock } }) : t("等待下一次采收")}
            </span>
          </div>
          <div className={`product-quantity ${quantity ? "is-selected" : ""}`}>
          {quantity > 0 && <button className="product-reduce" aria-label={t("减少{0}", {0: t(p.name)})} onClick={() => {
            onReduce();
            if (quantity === 1) requestAnimationFrame(() => addButton.current?.focus());
          }}><Minus size={15} /></button>}
          {quantity > 0 && <span className="product-quantity-value" aria-label={t("已选 {count} 件", { count: quantity })}>{quantity}</span>}
          <button
            className={`add-button ${quantity ? "has-quantity" : ""}`}
            ref={addButton}
            disabled={!p.stock || quantity >= p.stock}
            aria-label={t("将{0}加入购物袋", {0: t(p.name)})}
            onClick={onAdd}
          >
            <Plus size={20} />
          </button>
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
          <span className="eyebrow">{t("体验顾客、商户与学校管理方")}</span>
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
            <button className="demo-account school-demo-account" disabled={busy} onClick={() => void submit(undefined, "admin")}>
              <School size={22} />
              <strong>{t("学校管理方演示")}</strong>
              <small>{t("管市场 · 看全盘 · 社区影响")}</small>
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
            {t(busy ? "正在连接账号…" : register ? "创建顾客账号" : "登录")}
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
  onShop,
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
  onShop: () => void;
  onLogin: () => void;
  update: (cart: Cart) => void;
  onSuccess: (order: Order) => void;
  draft: CheckoutDraft;
  onDraftChange: (draft: CheckoutDraft) => void;
}) {
  const { t } = useLanguage();
  const firstProduct = products.find((p) => Object.hasOwn(cart, String(p.id)));
  const pickupDate = firstProduct?.available_date ?? config.today;
  const [options, setOptions] = useState<{ label: string; remaining: number | null }[]>([]);
  const [optionsReady, setOptionsReady] = useState(false);
  const [optionsError, setOptionsError] = useState(false);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  useEffect(() => {
    let current = true; setOptionsReady(false); setOptionsError(false); setOptions([]);
    if (!firstProduct) return;
    api<{ slots: { label: string; remaining: number | null }[] }>(`/checkout/options?marketId=${firstProduct.market_id}&date=${pickupDate}`)
      .then((result) => { if (current) { setOptions(result.slots.filter((s) => s.remaining !== 0)); setOptionsReady(true); } })
      .catch(() => { if (current) { setOptionsError(true); setOptionsReady(true); } });
    return () => { current = false; };
  }, [firstProduct?.market_id, pickupDate, optionsAttempt]);
  const slot = options.some((s) => s.label === draft.slot) ? draft.slot : (options[0]?.label ?? "");
  const { note } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>("");
  const [snapReady, setSnapReady] = useState(false);
  const entries = Object.entries(cart).map(([id, quantity]) => ({
    id: Number(id),
    product: products.find((p) => p.id === Number(id)),
    quantity,
  }));
  const total = entries.reduce(
    (sum, item) => sum + Math.round((item.product?.price_cents ?? 0) * item.quantity),
    0,
  );
  const invalid = entries.some(
    (item) => !item.product || item.quantity > (item.product?.stock ?? 0),
  ) || entries.some(item=>item.product && (item.product.market_id!==firstProduct?.market_id||item.product.retailer_id!==firstProduct?.retailer_id));
  const change = (id: number, quantity: number) => {
    const next = { ...cart };
    if (quantity <= 0) delete next[id];
    else next[id] = Math.round(quantity*1000)/1000;
    update(next);
    setError("");
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || invalid || !slot || (draft.paymentMethod === "snap_ebt" && !snapReady)) return;
    if (!user) return onLogin();
    setBusy(true);
    setError("");
    try {
      const payload={items:Object.entries(cart).map(([id,quantity])=>({productId:Number(id),quantity})),pickupSlot:slot,note,paymentMethod:draft.paymentMethod??'pay_at_pickup'};
      const fingerprint=JSON.stringify(payload);
      const submissionKey=draft.submissionFingerprint===fingerprint&&draft.submissionKey?draft.submissionKey:crypto.randomUUID();
      onDraftChange({...draft,submissionKey,submissionFingerprint:fingerprint});
      const order = await api<Order>("/orders", {
        method: "POST",
        headers:{'Idempotency-Key':submissionKey},
        body: fingerprint,
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
            <button className="button primary" onClick={onShop}>{t("继续逛逛")}<ArrowRight size={16} />
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
                        <SnapFoodLabel eligibility={p.snap_eligibility} />
                        <div className="quantity-control">
                          <button
                            type="button"
                            aria-label={t("减少{0}", {0: t(p.name)})}
                            onClick={() => change(p.id, quantity - 1)}
                          >
                            <Minus size={13} />
                          </button>
                          {p.unit==='磅'?<input className="weight-quantity" aria-label={t('预订磅数：{name}',{name:t(p.name)})} type="number" min="0.001" max={Math.min(p.stock,100)} step="0.001" value={quantity} onChange={e=>{const q=Number(e.target.value);if(Number.isFinite(q)&&q>0&&q<=Math.min(p.stock,100))change(p.id,q);}}/>:<span>{quantity}</span>}
                          <button
                            type="button"
                            aria-label={t("增加{0}", {0: t(p.name)})}
                            disabled={quantity >= p.stock}
                            onClick={() => change(p.id, Math.min(p.stock,100,quantity + 1))}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        {quantity > p.stock && (
                          <div className="stock-warning" role="status">
                            <span>{t("当前仅剩 {count} {unit}", { count: p.stock, unit: { unit: p.unit, count: p.stock } })}
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
                        <strong>{t(money(Math.round(p.price_cents * quantity)))}</strong>
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
              <p>{t(firstProduct?.market_name)}{firstProduct?.market_name && " · "}{t(firstProduct?.farm)}</p>
              {firstProduct?.market_address && <p>{t(firstProduct.market_address)}</p>}
              <p>{pickupDate}{t(" · 美国东部时间")}</p>
              <label>{t("选择自提时段")}<select
                  value={slot}
                  disabled={!options.length}
                  onChange={(e) =>
                    onDraftChange({ ...draft, slot: e.target.value })
                  }
                >
                  {!options.length && <option value="">{t(!optionsReady ? "正在加载自提时段…" : optionsError ? "自提时段加载失败" : "暂无可用自提时段")}</option>}
                  {options.map((s) => (
                    <option value={s.label} key={s.label}>{t(s.label)}{s.remaining !== null ? ` · ${t("剩余 {count} 个名额", { count: s.remaining })}` : ""}</option>
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
            <SnapCheckout itemsKey={JSON.stringify(Object.entries(cart).map(([id, quantity]) => ({ productId: Number(id), quantity })))}
              method={draft.paymentMethod ?? "pay_at_pickup"} onReady={setSnapReady}
              onChange={(paymentMethod) => onDraftChange({ ...draft, paymentMethod })} />
            <div className="cart-total">
              <span>{t("预计合计 ")}<small>USD</small>
              </span>
              <strong>{t(money(total))}</strong>
            </div>
            <p className="helper-text">{t("预购会为你保留库存；订单确认后请按时自提。此版本不收取线上款项。价格以提交订单时的服务端报价为准。")}</p>
            {user?.role==='client'&&draft.submissionKey&&<button type="button" className="button full-width" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{onSuccess(await api<Order>(`/order-submissions/${encodeURIComponent(draft.submissionKey!)}`));}catch(e){setError(e as Error);}finally{setBusy(false);}}}>{t('检查上次提交结果')}</button>}
            {invalid && (
              <p className="form-error" role="alert">{t("商品或库存已变化，请按上方提示调整购物袋后提交。")}</p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {t(error)}
              </p>
            )}
            {optionsError && <div className="pickup-retry" role="alert"><span>{t("自提时段加载失败，已选商品和备注仍保留。")}</span><button type="button" className="text-button" onClick={() => setOptionsAttempt((attempt) => attempt + 1)}>{t("重新加载时段")}</button></div>}
            {!slot && optionsReady && !optionsError && (
              <p className="form-error" role="alert">{t("当前暂无可用自提时段，请稍后再来。")}</p>
            )}
            <button
              className="button primary full-width cart-submit"
              disabled={busy || invalid || !slot || (draft.paymentMethod === "snap_ebt" && !snapReady) || (!!user && user.role !== "client")}
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
        if (!cancelled) setError(e as Error);
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
                      <strong>{t(money(Math.round(item.price_cents * item.quantity)))}</strong>
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
                  {translatePreviewContent(o.client_name, t)}
                </span>
              </div>
              {o.note && <p className="order-note">{t("备注：")}{translatePreviewContent(o.note, t)}</p>}
              {user.role === "client" && o.pickup_code && ["pending", "confirmed"].includes(o.status) && <div className="customer-pickup-code"><span>{t("向现场工作人员出示取货码")}</span><strong>{o.pickup_code}</strong><small>{t("待确认订单请等待备货确认后再到场。")}</small></div>}
              <SnapOrderPlan order={o} />
              <OrderAdjustmentPanel order={o} customer={user.role==='client'} refresh={refresh} />
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
                  {user.role === "retailer" && o.status === "confirmed" && !o.market_session_id && !o.adjustment && (
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
              {user.role === "retailer" && o.status === "confirmed" && (!!o.market_session_id||!!o.adjustment) && o.adjustment?.status!=='proposed' && <PickupForm orderId={o.id} total={o.total_cents} snapLimit={o.payment_method === "snap_ebt" ? o.snap_eligible_cents : 0} busy={busy === o.id} submit={async (body) => { if (busy) return; setBusy(o.id); try { await api(`/orders/${o.id}/pickup`, { method: "POST", body: JSON.stringify(body) }); refresh(); notify("订单已完成"); } finally { setBusy(""); } }} />}
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

function RetailDashboard({
  revision,
  navigate,
  notify,
}: {
  revision: number;
  navigate: (p: Page) => void;
  notify: (s: Message) => void;
}) {
  const { t } = useLanguage();
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState<Message>("");
  useEffect(() => {
    let cancelled = false;
    api<Dashboard>("/retailer/dashboard")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e as Error);
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
          <span className="eyebrow">GOOD FOOD STARTS WITH YOU</span>
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
                    <strong>{translatePreviewContent(o.client_name, t)}</strong>
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
            <span className="eyebrow">STOCK WATCH</span>
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
                  <small>{t("剩余 {count} {unit}", { count: p.stock, unit: { unit: p.unit, count: p.stock } })}
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
  const [inventoryMarket, setInventoryMarket] = useState("all");
  useEffect(() => {
    let cancelled = false;
    setError("");
    api<Product[]>("/retailer/products")
      .then((d) => {
        if (!cancelled) setProducts(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e as Error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const close = useCallback(() => setEditing(undefined), []);
  const shown = products.filter((p) => matchesSearch(search, p.name) && (inventoryMarket === "all" || String(p.market_id) === inventoryMarket));
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
        <select aria-label={t("筛选库存市场")} value={inventoryMarket} onChange={(e) => setInventoryMarket(e.target.value)}>
          <option value="all">{t("全部市场")}</option>
          {Array.from(new Map(products.map((p) => [p.market_id, p.market_name])).entries()).map(([id, name]) => <option key={id} value={id}>{name ? t(name) : id}</option>)}
        </select>
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
                          <small>{t(p.market_name ?? (p.organic ? "有机种植" : "当季新鲜"))}</small>
                          <SnapFoodLabel eligibility={p.snap_eligibility} />
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
  const [snapEligibility, setSnapEligibility] = useState<Product["snap_eligibility"]>(p?.snap_eligibility ?? "unknown");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketId, setMarketId] = useState(p?.market_id ?? 0);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>("");
  useEffect(() => {
    let current = true;
    api<Market[]>("/retailer/markets").then((list) => {
      if (!current) return;
      setMarkets(list);
      setMarketId((id) => id || list.find((m) => m.active)?.id || 0);
    }).catch((e: Error) => { if (current) setError(e as Error); })
      .finally(() => { if (current) setMarketsLoading(false); });
    return () => { current = false; };
  }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(p ? `/retailer/products/${p.id}` : "/retailer/products", {
        method: p ? "PUT" : "POST",
        body: JSON.stringify({
          market_id: marketId,
          snap_eligibility: snapEligibility,
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
          <label>{t("所属运营市场")}<select aria-label={t("所属运营市场")} required value={marketId || ""} disabled={marketsLoading}
            onChange={(e) => setMarketId(Number(e.target.value))}>
            <option value="" disabled>{t(marketsLoading ? "正在读取入驻市场…" : "请选择入驻市场")}</option>
            {p && !markets.some((m) => m.id === p.market_id) && <option value={p.market_id}>{t("原市场（已退出，仅可下架）")}</option>}
            {markets.map((m) => <option key={m.id} value={m.id}>{t(m.name)}{!m.active ? ` · ${t("已停用")}` : ""}</option>)}
          </select></label>
          {!marketsLoading && !markets.length && <p className="helper-text">{t("请联系学校管理方分配入驻市场后再上架。")}</p>}
          <label>{t("SNAP 食品资格标记")}<select aria-label={t("SNAP 食品资格标记")} value={snapEligibility} onChange={(e) => setSnapEligibility(e.target.value as Product["snap_eligibility"])}>
            <option value="unknown">{t("待核实，不计入 SNAP 食品预估")}</option><option value="eligible">{t("合资格食品（按 USDA 规则核实）")}</option><option value="ineligible">{t("不适用 SNAP，需其他方式付款")}</option>
          </select></label>
          <p className="helper-text">{t("新鲜果蔬通常符合食品范围；资格标记不等于本市场或商户已获准接受 EBT。")}</p>
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
                step={unit === "磅" ? "0.001" : "1"}
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
