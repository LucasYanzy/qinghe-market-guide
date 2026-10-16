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
  Clock3,
  ExternalLink,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  Minus,
  Navigation,
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
import { officialMarketUrl } from "./marketReference";
import ReferencePrices from "./ReferencePrices";
import type {
  Config,
  Dashboard,
  Market,
  Order,
  OrderStatus,
  PriceData,
  Product,
  Role,
  User,
} from "./types";

type Page =
  "discover" | "markets" | "prices" | "orders" | "dashboard" | "inventory";
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
] as const;
const retailerNav = [
  { id: "dashboard", label: "经营概览", icon: BarChart3 },
  { id: "inventory", label: "商品与库存", icon: Sprout },
  { id: "orders", label: "预购订单", icon: ShoppingBag },
  { id: "prices", label: "价格观察", icon: TrendingUp },
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
        aria-label={title}
        aria-busy={busy}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭弹窗"
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
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function App() {
  const [config, setConfig] = useState<Config>();
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("discover");
  const [products, setProducts] = useState<Product[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
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
  const notify = useCallback((message: string) => setToast(message), []);
  const refresh = useCallback(() => {
    setRevision((r) => r + 1);
  }, []);
  const load = useCallback(async () => {
    setLoadError("");
    setLoading(true);
    try {
      const [c, u, p, m] = await Promise.all([
        api<Config>("/config"),
        api<{ user: User | null }>("/auth/me"),
        api<Product[]>("/products"),
        api<Market[]>("/markets"),
      ]);
      setConfig(c);
      setUser(u.user);
      setProducts(p);
      setMarkets(m);
      if (u.user?.role === "retailer")
        setPage((prev) => (prev === "discover" ? "dashboard" : prev));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (revision)
      api<Product[]>("/products")
        .then(setProducts)
        .catch((e) => notify(e.message));
  }, [revision, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
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
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    setPage(
      next.role === "retailer"
        ? "dashboard"
        : loginIntent === "orders"
          ? "orders"
          : retailer
            ? "discover"
            : page,
    );
    setLoginIntent(null);
    refresh();
    notify(
      loginIntent === "cart" && !resetCart
        ? "登录成功，请确认自提信息后提交预购"
        : `欢迎回来，${next.name}`,
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
      notify((e as Error).message);
    }
  };
  const add = (product: Product) => {
    if (retailer) return;
    if ((cart[product.id] ?? 0) >= product.stock)
      return notify("已达到当前库存数量");
    setCart((c) => ({ ...c, [product.id]: (c[product.id] ?? 0) + 1 }));
    notify(`${product.name} 已加入购物袋`);
  };
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  let visible = products.filter(
    (p) =>
      (category === "全部蔬菜" || p.category === category) &&
      (!inStock || p.stock > 0) &&
      `${p.name}${p.farm}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (sort === "price-up")
    visible = [...visible].sort((a, b) => a.price_cents - b.price_cents);
  if (sort === "price-down")
    visible = [...visible].sort((a, b) => b.price_cents - a.price_cents);
  const nav = retailer ? retailerNav : clientNav;
  const title = nav.find((n) => n.id === page)?.label ?? "逛逛市集";
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
        <h2>青禾 QINGHE</h2>
        <LoaderCircle className="spin" />
        <p>正在准备今日的新鲜…</p>
      </div>
    );
  if (loadError || !config)
    return (
      <div className="boot-screen">
        <Sprout size={44} />
        <h2>暂时无法连接市集</h2>
        <p>{loadError}</p>
        <button className="button primary" onClick={() => void load()}>
          重新连接
        </button>
      </div>
    );
  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="关闭导航"
        />
      )}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate(retailer ? "dashboard" : "discover");
          }}
        >
          <span className="brand-symbol">
            <Leaf size={25} />
          </span>
          <span>
            <b>
              青禾<span className="brand-english">QINGHE</span>
            </b>
            <small>RUTGERS FARMERS MARKET</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="tiny-dot" />
          {retailer ? "RETAILER · 商户工作台" : "CLIENT · 顾客空间"}
        </div>
        <nav aria-label="主导航">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              {item.label}
              {page === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-leaf">
            <Sprout size={28} />
          </span>
          <h4>好食物，连接好邻里。</h4>
          <p>
            支持在地农场
            <br />
            让每一口新鲜都有来处。
          </p>
          <span>LOCAL FOOD. LOCAL GOOD.</span>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">{user ? user.name.slice(0, 1) : "青"}</div>
          <div>
            <strong>{user?.name ?? "欢迎来到青禾"}</strong>
            <small>
              {user
                ? retailer
                  ? "农场商户"
                  : "社区新鲜探索者"
                : "登录，开启新鲜日常"}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label={user ? "退出登录" : "登录"}
            onClick={() => (user ? void logout() : setAuthOpen(true))}
          >
            {user ? <LogOut size={17} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label="打开导航"
            >
              <Menu />
            </button>
            <span>社区农夫市集</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="today-label">
              <span className="tiny-dot" />
              {config.today.replaceAll("-", ".")}{" "}
              <span className="timezone-label">ET</span>
            </span>
            <button className="role-switch" onClick={() => setAuthOpen(true)}>
              <Users size={16} />
              {retailer ? "切换到顾客端" : "商户入口"}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {retailer
                  ? "GROW YOUR LOCAL BUSINESS"
                  : "A LITTLE FRESHNESS, EVERY DAY"}
              </div>
              <h1>
                {page === "discover" ? "今天，也要好好吃饭。" : title}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {page === "discover"
                  ? "从附近的农场，到你的餐桌。发现这一季刚刚好的新鲜。"
                  : page === "dashboard"
                    ? "照顾好每一份收获，让新鲜被更多人看见。"
                    : page === "inventory"
                      ? "今日上架、价格与库存，在这里轻松管理。"
                      : page === "markets"
                        ? "找到身边的市集，让新鲜离你更近一点。"
                        : page === "prices"
                          ? "看懂价格的变化，为每一次选择多一份参考。"
                          : "每一份期待，都值得新鲜抵达。"}
              </p>
            </div>
            {!retailer && (
              <button
                className="button cart-button"
                onClick={() => setCartOpen(true)}
              >
                <ShoppingBag size={18} />
                购物袋<span className="count-pill">{cartCount}</span>
              </button>
            )}
          </div>
          {config.demo && (
            <div className="demo-notice">
              <span className="demo-badge">DEMO</span>{" "}
              当前为演示市集，地址、商品、价格历史及自提安排均未经官网核验。
              {retailer && " 商户修改会保存到本地数据库。"}
            </div>
          )}
          {page === "discover" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="hero-kicker">
                    <span />
                    在地生长 · 当季新鲜
                  </div>
                  <h2>
                    把田野的新鲜，
                    <br />
                    带回你的餐桌<span>。</span>
                  </h2>
                  <p>
                    一份当季蔬菜，一点简单的幸福。
                    <br />
                    提前预购，来市集把好味道带回家。
                  </p>
                  <button
                    className="button primary"
                    onClick={() =>
                      document
                        .getElementById("today-produce")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    挑选今日蔬菜
                    <ArrowRight size={17} />
                  </button>
                  <div className="hero-footnote">
                    <Sprout size={14} />
                    和社区一起，把日子过得更鲜活。
                  </div>
                </div>
                <BasketArt />
              </section>
              <div className="benefits">
                <div>
                  <span className="benefit-icon">
                    <Leaf size={22} />
                  </span>
                  <div>
                    <strong>当季采收</strong>
                    <small>看得见的新鲜与来处</small>
                  </div>
                </div>
                <div>
                  <span className="benefit-icon peach">
                    <ShoppingBag size={22} />
                  </span>
                  <div>
                    <strong>线上预购</strong>
                    <small>选好新鲜，到场轻松取</small>
                  </div>
                </div>
                <div>
                  <span className="benefit-icon lilac">
                    <TrendingUp size={22} />
                  </span>
                  <div>
                    <strong>价格透明</strong>
                    <small>历史走势，心中有数</small>
                  </div>
                </div>
              </div>
              <div className="section-heading" id="today-produce">
                <div>
                  <span className="eyebrow">FRESH FROM THE FARM</span>
                  <h2>
                    今日新鲜上架{" "}
                    <span className="subtle-count">
                      {products.length} 款当季好物
                    </span>
                  </h2>
                </div>
                <span className="harvest-tag">
                  <span className="tiny-dot" />
                  今日可预购
                </span>
              </div>
              <div className="product-toolbar">
                <div
                  className="category-tabs"
                  role="group"
                  aria-label="蔬菜分类"
                >
                  {["全部蔬菜", "叶菜类", "根茎类", "果实类"].map((c) => (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      aria-pressed={category === c}
                      onClick={() => setCategory(c)}
                    >
                      {c === "全部蔬菜" && <Sprout size={16} />} {c}
                    </button>
                  ))}
                </div>
                <div className="filter-actions">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="搜索蔬菜或农场"
                      placeholder="找找你喜欢的蔬菜…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        aria-label="清除搜索"
                        onClick={() => setSearch("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <label className="sort-select">
                    <SlidersHorizontal size={15} />
                    <select
                      aria-label="商品排序"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recommended">推荐排序</option>
                      <option value="price-up">价格从低到高</option>
                      <option value="price-down">价格从高到低</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="results-meta">
                <span>发现 {visible.length} 款新鲜好物</span>
                <label>
                  <input
                    type="checkbox"
                    checked={inStock}
                    onChange={(e) => setInStock(e.target.checked)}
                  />{" "}
                  仅看有库存
                </label>
              </div>
              {visible.length ? (
                <div className="product-grid">
                  {visible.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={cart[product.id] ?? 0}
                      onAdd={() => add(product)}
                      onView={() => setDetail(product)}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<Search />}
                  title="还没找到这份新鲜"
                  text="试试其他分类或关键词，也可以查看暂时售罄的商品。"
                  action={
                    <button
                      className="button secondary"
                      onClick={() => {
                        setSearch("");
                        setCategory("全部蔬菜");
                        setInStock(false);
                      }}
                    >
                      清除筛选
                    </button>
                  }
                />
              )}
              {markets[0] && (
                <section className="market-strip">
                  <div className="market-strip-icon">
                    <Store size={30} />
                  </div>
                  <div>
                    <span className="eyebrow">MEET US AT THE MARKET</span>
                    <h3>下次见面，就在市集。</h3>
                    <p>{markets[0].address}</p>
                    {config.demo && (
                      <p>演示地址 · 出发前请查看 Rutgers 官方安排</p>
                    )}
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => navigate("markets")}
                  >
                    查看市场与导航
                    <ArrowUpRight size={17} />
                  </button>
                </section>
              )}
            </>
          )}
          {page === "markets" && (
            <Markets markets={markets} demo={config.demo} />
          )}
          {page === "prices" && (
            <Prices products={products} revision={revision} />
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
          <footer>
            <span>
              <Leaf size={14} />
              青禾 · 让新鲜，发生在身边。
            </span>
            <span>
              Rutgers Community Farmers Market{" "}
              <span className="footer-dot">·</span>{" "}
              {config.demo ? "演示版本" : "社区市集"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
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
            notify(`预购成功 · ${order.id}`);
          }}
        />
      )}
      {detail && (
        <Modal title="这份新鲜的故事" onClose={closeDetail}>
          <div className={`detail-art art-bg-${detail.art}`}>
            <Produce kind={detail.art} />
            {detail.organic === 1 && (
              <span className="organic-badge">
                <Leaf size={12} />
                有机种植 · 演示
              </span>
            )}
          </div>
          <div className="detail-copy">
            <span className="eyebrow">{detail.farm}</span>
            <h2>{detail.name}</h2>
            <p>{detail.description}</p>
            <div className="detail-meta">
              <strong>
                {money(detail.price_cents)}
                <small> / {detail.unit}</small>
              </strong>
              <span>
                今日剩余 {detail.stock} {detail.unit}
              </span>
            </div>
            <p className="helper-text">
              称重类商品按标示单位预订；如需现场称重，最终金额请与商户确认。
            </p>
            <button
              className="button primary full-width"
              disabled={!detail.stock || retailer}
              onClick={() => add(detail)}
            >
              <ShoppingBag size={17} />
              {detail.stock ? "加入购物袋" : "今日已售罄"}
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
  onView,
}: {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onView: () => void;
}) {
  return (
    <article className="product-card">
      <button
        className={`product-image art-bg-${p.art}`}
        onClick={onView}
        aria-label={`查看${p.name}`}
      >
        <Produce kind={p.art} />
        {p.organic === 1 && (
          <span className="organic-badge">
            <Leaf size={11} />
            有机种植
          </span>
        )}
        {p.stock === 0 && <span className="sold-out">今日售罄</span>}
        <span className="view-product">
          了解这份新鲜
          <ArrowUpRight size={14} />
        </span>
      </button>
      <div className="product-copy">
        <div className="farm-label">
          <span className="tiny-dot" />
          {p.farm}
        </div>
        <button className="product-name" onClick={onView}>
          {p.name}
        </button>
        <div className="product-description">
          {p.description.split("。")[0]}
        </div>
        <div className="product-bottom">
          <div>
            <strong>{money(p.price_cents)}</strong>
            <small> / {p.unit}</small>
            <span className={`stock-label ${p.stock < 10 ? "low" : ""}`}>
              {p.stock > 0 ? `剩余 ${p.stock} ${p.unit}` : "等待下一次采收"}
            </span>
          </div>
          <button
            className={`add-button ${quantity ? "has-quantity" : ""}`}
            disabled={!p.stock || quantity >= p.stock}
            aria-label={`将${p.name}加入购物袋`}
            onClick={onAdd}
          >
            {quantity ? <span>{quantity}</span> : <Plus size={20} />}
          </button>
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
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={register ? "加入青禾社区" : "你好，欢迎来到青禾"}
      onClose={onClose}
      busy={busy}
    >
      <p className="modal-intro">
        {checkout
          ? "购物袋、自提时段和备注已保留。登录顾客账号后继续确认，不会自动下单。"
          : "一个账号，连接附近的好食物与好邻里。"}
      </p>
      {demo && (
        <div className="demo-login">
          <span className="eyebrow">体验完整的双端流程</span>
          <div>
            <button
              className="demo-account"
              disabled={busy}
              onClick={() => void submit(undefined, "client")}
            >
              <ShoppingBag size={22} />
              <strong>顾客端演示</strong>
              <small>逛市集 · 预购自提</small>
              <ArrowRight size={16} />
            </button>
            <button
              className="demo-account"
              disabled={busy}
              onClick={() => void submit(undefined, "retailer")}
            >
              <Store size={22} />
              <strong>商户端演示</strong>
              <small>管商品 · 处理订单</small>
              <ArrowRight size={16} />
            </button>
          </div>
          <p>演示账号仅供体验，请勿填写真实个人信息。</p>
        </div>
      )}
      <div className="divider">
        <span>或使用邮箱{register ? "注册" : "登录"}</span>
      </div>
      <form onSubmit={submit} className="form-stack">
        <fieldset className="form-fields form-stack" disabled={busy}>
          {register && (
            <label>
              称呼
              <input
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="我们该怎么称呼你"
              />
            </label>
          )}
          <label>
            邮箱地址
            <input
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            密码
            <input
              required
              type="password"
              minLength={register ? 10 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder={register ? "至少 10 个字符" : "输入你的密码"}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full-width" disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : null}
            {busy ? "正在连接账号…" : register ? "创建顾客账号" : "登录"}
            <ArrowRight size={16} />
          </button>
        </fieldset>
      </form>
      <p className="auth-toggle">
        {register ? "已有账号？" : "第一次来？"}
        <button
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "前往登录" : "注册顾客账号"}
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
  const slot = config.pickupSlots.includes(draft.slot)
    ? draft.slot
    : (config.pickupSlots[0] ?? "");
  const { note } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="我的新鲜购物袋" onClose={onClose} busy={busy}>
      {!entries.length ? (
        <Empty
          title="购物袋在等一份新鲜"
          text="挑选喜欢的蔬菜，提前预购，到市集轻松取。"
          action={
            <button className="button primary" onClick={onClose}>
              继续逛逛
              <ArrowRight size={16} />
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
                        <strong>{p.name}</strong>
                        <small>
                          {money(p.price_cents)} / {p.unit}
                        </small>
                        <div className="quantity-control">
                          <button
                            type="button"
                            aria-label={`减少${p.name}`}
                            onClick={() => change(p.id, quantity - 1)}
                          >
                            <Minus size={13} />
                          </button>
                          <span>{quantity}</span>
                          <button
                            type="button"
                            aria-label={`增加${p.name}`}
                            disabled={quantity >= p.stock}
                            onClick={() => change(p.id, quantity + 1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        {quantity > p.stock && (
                          <div className="stock-warning" role="status">
                            <span>
                              当前仅剩 {p.stock} {p.unit}
                            </span>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => change(p.id, p.stock)}
                            >
                              {p.stock > 0 ? "调整至可购数量" : "移除售罄商品"}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="cart-line-total">
                        <strong>{money(p.price_cents * quantity)}</strong>
                        <button
                          type="button"
                          aria-label={`移除${p.name}`}
                          onClick={() => change(p.id, 0)}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>商品已下架，请移除后继续预购。</p>
                      <button type="button" onClick={() => change(id, 0)}>
                        移除
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="pickup-box">
              <div>
                <Store size={17} />
                <strong>市集自提 · 到场付款</strong>
              </div>
              <p>{config.today} · 美国东部时间</p>
              <label>
                选择自提时段
                <select
                  value={slot}
                  onChange={(e) =>
                    onDraftChange({ ...draft, slot: e.target.value })
                  }
                >
                  {config.pickupSlots.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                给农场的小纸条 <span>（选填）</span>
                <textarea
                  maxLength={300}
                  rows={2}
                  placeholder="有什么需要我们提前知道的吗？"
                  value={note}
                  onChange={(e) =>
                    onDraftChange({ ...draft, note: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="cart-total">
              <span>
                预计合计 <small>USD</small>
              </span>
              <strong>{money(total)}</strong>
            </div>
            <p className="helper-text">
              预购会为你保留库存；订单确认后请按时自提。此版本不收取线上款项。价格以提交订单时的服务端报价为准。
            </p>
            {invalid && (
              <p className="form-error" role="alert">
                商品或库存已变化，请按上方提示调整购物袋后提交。
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {!slot && (
              <p className="form-error" role="alert">
                当前暂无可用自提时段，请稍后再来。
              </p>
            )}
            <button
              className="button primary full-width"
              disabled={busy || invalid || !slot || user?.role === "retailer"}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <ShoppingBag size={17} />
              )}{" "}
              {busy
                ? "正在提交预购，请稍候…"
                : user
                  ? "确认预购"
                  : "登录后预购"}
              <ArrowRight size={16} />
            </button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}

function Markets({ markets, demo }: { markets: Market[]; demo: boolean }) {
  if (!markets.length)
    return (
      <Empty
        icon={<MapPin />}
        title="市场信息正在准备中"
        text="市场配置完成后，将在这里显示地址和导航入口。"
      />
    );
  return (
    <div className="market-page">
      <section className="official-market-reference">
        <div className="official-reference-icon">
          <Store size={25} />
        </div>
        <div className="official-reference-copy">
          <span className="eyebrow">
            RUTGERS · OFF-CAMPUS LIVING & COMMUNITY INITIATIVES
          </span>
          <h2>Rutgers Farmers Market</h2>
          <p>
            市场介绍请参考 Rutgers
            官方页面。地址、开放日期、营业时间及食品援助政策需以官方最新公告为准。
          </p>
          {demo && (
            <small>
              当前下方展示的是流程演示，尚未与官网信息核对，请勿据此安排出行。
            </small>
          )}
        </div>
        <a
          className="button official-reference-link"
          href={officialMarketUrl}
          target="_blank"
          rel="noreferrer"
        >
          查看 Rutgers 官方页面
          <ExternalLink size={15} />
        </a>
      </section>
      {markets.map((m) => (
        <section className="market-card" key={m.id}>
          <div
            className="illustrated-map"
            aria-label="市场位置示意图，非实际地图"
          >
            <div className="map-park park-one" />
            <div className="map-park park-two" />
            <div className="map-road road-one" />
            <div className="map-road road-two" />
            <div className="map-road road-three" />
            <span className="map-label map-label-one">MARKET LOCATION</span>
            <span className="map-label map-label-two">
              {demo ? "DEMO ROUTE" : "MARKET ROUTE"}
            </span>
            <div className="map-pin">
              <Store size={30} />
            </div>
            <div className="map-tooltip">
              <strong>在这里，与新鲜见面</strong>
              <small>
                {m.name}
                {demo && " · 演示"}
              </small>
            </div>
            <span className="map-disclaimer">
              {demo
                ? "演示位置示意 · 非官网核验地点"
                : "位置示意 · 请使用导航查看实际路线"}
            </span>
          </div>
          <div className="market-info">
            <span className="eyebrow">YOUR NEIGHBORHOOD MARKET</span>
            <h2>{m.name}</h2>
            <p className="market-subtitle">{m.subtitle}</p>
            <div className="market-detail">
              <MapPin size={19} />
              <div>
                <strong>{demo ? "演示地址（待官网核验）" : "市场地址"}</strong>
                <p>{m.address}</p>
              </div>
            </div>
            <div className="market-detail">
              <Clock3 size={19} />
              <div>
                <strong>
                  {demo ? "演示自提时间（非官方营业安排）" : "自提时间"}
                </strong>
                <p>{m.hours}</p>
              </div>
            </div>
            <p className="market-story">{m.description}</p>
            <div className="navigation-buttons">
              <a
                className="button primary"
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(m.address)}&travelmode=driving`}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={17} />
                {demo ? "演示路线 · Google 地图" : "Google 地图导航"}
                <ExternalLink size={14} />
              </a>
              <a
                className="button secondary"
                href={`https://maps.apple.com/?daddr=${encodeURIComponent(m.address)}&dirflg=d`}
                target="_blank"
                rel="noreferrer"
              >
                {demo ? "演示路线 · Apple 地图" : "Apple 地图"}
                <ArrowUpRight size={16} />
              </a>
            </div>
            <p className="helper-text">
              {demo
                ? "演示路线仅用于体验导航功能，出行前请通过上方官方页面核实实际地址。"
                : "导航会在地图服务中打开，不需要向本站提供你的位置。"}
            </p>
          </div>
        </section>
      ))}
      <div className="visit-tips">
        <div>
          <ShoppingBag />
          <h3>先选好，再出发</h3>
          <p>线上预购喜欢的蔬菜，查看订单确认状态。</p>
        </div>
        <div>
          <Clock3 />
          <h3>带上你的期待</h3>
          <p>在预约时段到场，向商户出示订单编号。</p>
        </div>
        <div>
          <Leaf />
          <h3>给地球一点心意</h3>
          <p>带上可重复使用的购物袋，让新鲜更可持续。</p>
        </div>
      </div>
    </div>
  );
}

function Prices({
  products,
  revision,
}: {
  products: Product[];
  revision: number;
}) {
  const [view, setView] = useState<"archive" | "forecast">("archive");
  return (
    <>
      <div className="category-tabs price-view-tabs" aria-label="价格资料类型">
        <button
          className={view === "archive" ? "selected" : ""}
          onClick={() => setView("archive")}
        >
          Externship 采价档案
        </button>
        <button
          className={view === "forecast" ? "selected" : ""}
          onClick={() => setView("forecast")}
        >
          演示价格趋势与预测
        </button>
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
  const [selected, setSelected] = useState(products[0]?.id ?? 0);
  const [data, setData] = useState<PriceData>();
  const [error, setError] = useState("");
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
        if (!cancelled) setError(e.message);
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
        title="还没有可观察的价格"
        text="商品上架后，可以查看已记录的历史价格与预测。"
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
          <span>选择观察蔬菜</span>
          <select
            aria-label="选择观察蔬菜"
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {products.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · 每{p.unit}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </div>
        <span className="helper-text">
          价格单位：美元（USD） / 商品标示单位
        </span>
      </div>
      {error ? (
        <div className="error-panel" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setSelected(products[0].id)}
          >
            查看首个商品
          </button>
        </div>
      ) : busy ? (
        <div className="loading-panel">
          <LoaderCircle className="spin" />
          正在分析价格记录…
        </div>
      ) : (
        data && (
          <>
            <div className="stat-grid price-stat-grid">
              <Stat
                label="当前售价"
                value={money(data.product.price_cents)}
                note={`每${data.product.unit} · 最新记录 ${shortDate(data.history.at(-1)?.date ?? "")}`}
                icon={<Wallet />}
              />
              <Stat
                label="历史期间变化"
                value={`${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
                note={`对比 ${shortDate(data.history[0]?.date ?? "")} 首条记录`}
                icon={change > 0 ? <ArrowUpRight /> : <ArrowDownRight />}
              />
              <Stat
                label="7 天后预测"
                value={
                  data.forecast.points.length
                    ? money(data.forecast.points.at(-1)!.price_cents)
                    : "数据不足"
                }
                note="模型估算，不代表实际成交价"
                icon={<TrendingUp />}
              />
              <Stat
                label="回测平均绝对误差"
                value={
                  data.forecast.maeCents !== null
                    ? money(data.forecast.maeCents)
                    : "—"
                }
                note={`${data.forecast.sampleSize} 条历史记录 · 滚动单步回测`}
                icon={<BarChart3 />}
              />
            </div>
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">A CLEARER VIEW OF FRESHNESS</span>
                  <h2>{data.product.name} · 价格走势</h2>
                </div>
                <div className="chart-legend">
                  <span>
                    <i />
                    历史价格
                  </span>
                  <span>
                    <i className="predicted" />
                    趋势预测
                  </span>
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
                          ? "历史价格"
                          : name === "range"
                            ? "估计区间"
                            : "趋势预测",
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
                  <strong>{data.forecast.method}</strong>
                  <p>
                    {data.forecast.message}{" "}
                    演示模式下的历史记录为生成的示例数据。
                  </p>
                </div>
              </div>
            </section>
            <section className="panel forecast-table">
              <div className="panel-heading">
                <h3>未来 7 天参考价格</h3>
                <span className="muted">含模型估计区间</span>
              </div>
              {data.forecast.points.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>参考价格 / {data.product.unit}</th>
                        <th>估计区间</th>
                        <th>相对当前售价</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.forecast.points.map((p) => (
                        <tr key={p.date}>
                          <td>{p.date}</td>
                          <td>
                            <strong>{money(p.price_cents)}</strong>
                          </td>
                          <td>
                            {money(p.low_cents)} – {money(p.high_cents)}
                          </td>
                          <td>
                            <span
                              className={
                                p.price_cents <= latest
                                  ? "trend-down"
                                  : "trend-up"
                              }
                            >
                              {p.price_cents > latest ? "+" : ""}
                              {money(p.price_cents - latest)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="helper-text">
                  积累至少 7 天的价格记录后显示预测结果。
                </p>
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
  notify: (s: string) => void;
  onLogin: () => void;
  onShop: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
        if (!cancelled) setError(e.message);
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
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  if (!user)
    return (
      <Empty
        title="登录，查看你的新鲜预购"
        text="订单、取货时段和状态，会在这里为你妥善记录。"
        action={
          <button className="button primary" onClick={onLogin}>
            登录 / 注册
            <ArrowRight size={16} />
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
        >
          全部订单 <span>{orders.length}</span>
        </button>
        {Object.entries(statusLabels).map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "selected" : ""}
            onClick={() => setFilter(key)}
          >
            {label} <span>{orders.filter((o) => o.status === key).length}</span>
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading-panel">
          <LoaderCircle className="spin" />
          正在读取预购订单…
        </div>
      ) : error ? (
        <div className="error-panel" role="alert">
          {error}
          <button className="text-button" onClick={refresh}>
            重新加载
          </button>
        </div>
      ) : !visible.length ? (
        <Empty
          title={filter === "all" ? "还没有新鲜预购" : "这个状态下还没有订单"}
          text={
            user.role === "client"
              ? "去看看今日的蔬菜，为下一餐挑一点新鲜。"
              : "顾客提交预购后，你可以在这里确认订单并安排自提。"
          }
          action={
            user.role === "client" ? (
              <button className="button primary" onClick={onShop}>
                逛逛今日市集
                <ArrowRight size={16} />
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
                  <strong>{o.id}</strong>
                  <span>
                    {o.created_at
                      .replace(" ", "T")
                      .slice(0, 16)
                      .replace("T", " ")}{" "}
                    UTC
                  </span>
                </div>
                <span className={`status-badge status-${o.status}`}>
                  <span />
                  {statusLabels[o.status]}
                </span>
              </div>
              <div className="order-items">
                {o.items.map((item) => (
                  <div key={item.product_id}>
                    <span>
                      {item.name}
                      <small>
                        {money(item.price_cents)} / {item.unit}
                      </small>
                    </span>
                    <span>
                      × {item.quantity}
                      <strong>{money(item.price_cents * item.quantity)}</strong>
                    </span>
                  </div>
                ))}
              </div>
              <div className="order-pickup">
                <MapPin size={16} />
                <span>
                  {o.pickup_date} · {o.pickup_slot} ET
                </span>
                <span className="order-client">
                  <Users size={15} />
                  {o.client_name}
                </span>
              </div>
              {o.note && <p className="order-note">备注：{o.note}</p>}
              <div className="order-card-bottom">
                <span>
                  到场付款 · 共 {o.items.reduce((a, i) => a + i.quantity, 0)} 件
                  <strong>{money(o.total_cents)}</strong>
                </span>
                <div>
                  {(o.status === "pending" ||
                    (o.status === "confirmed" && user.role === "retailer")) && (
                    <button
                      className="button subtle"
                      disabled={!!busy}
                      onClick={() => setCancelOrder(o)}
                    >
                      取消订单
                    </button>
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
                      {busy === o.id ? "正在确认…" : "确认预购"}
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
                      {busy === o.id ? "正在更新…" : "确认已自提并收款"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {cancelOrder && (
        <Modal title="取消这份预购？" onClose={closeCancel} busy={!!busy}>
          <p className="modal-intro">
            订单 {cancelOrder.id}{" "}
            取消后，预留库存会自动归还。已取消订单无法恢复。
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={closeCancel}
              disabled={!!busy}
            >
              保留订单
            </button>
            <button
              className="button danger"
              disabled={!!busy}
              onClick={() => void update(cancelOrder, "cancelled")}
            >
              {busy ? "正在取消…" : "确认取消"}
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
  return (
    <div className="stat-card">
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <p>{note}</p>
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
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api<Dashboard>("/retailer/dashboard")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  if (error)
    return (
      <div className="error-panel" role="alert">
        {error}
      </div>
    );
  if (!data)
    return (
      <div className="loading-panel">
        <LoaderCircle className="spin" />
        正在汇总经营数据…
      </div>
    );
  return (
    <>
      <section className="retailer-welcome">
        <div>
          <span className="eyebrow">GOOD FOOD STARTS WITH YOU</span>
          <h2>
            每一份用心，
            <br />
            都有一张餐桌在等待。
          </h2>
          <p>今天也一起，让社区的餐桌更丰富一点。</p>
          <button
            className="button primary"
            onClick={() => navigate("inventory")}
          >
            管理今日商品
            <ArrowRight size={17} />
          </button>
        </div>
        <BasketArt />
      </section>
      <div className="stat-grid">
        <Stat
          label="今日预购订单"
          value={String(data.todayOrders)}
          note={`${data.pending} 笔订单等待确认（含往日）`}
          icon={<ShoppingBag />}
        />
        <Stat
          label="今日已完成金额"
          value={money(data.revenueCents)}
          note="仅统计已自提并收款的订单"
          icon={<Wallet />}
        />
        <Stat
          label="今日待履约金额"
          value={money(data.reservedCents)}
          note="待确认与待自提订单合计"
          icon={<Truck />}
        />
        <Stat
          label="今日在售商品"
          value={String(data.activeProducts)}
          note={`${data.lowStock.length} 款商品库存低于 10`}
          icon={<Package />}
        />
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <h3>最近的预购</h3>
            <button className="text-button" onClick={() => navigate("orders")}>
              查看全部
              <ArrowRight size={15} />
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
                      {o.id} · {o.items.length} 款商品
                    </small>
                  </span>
                  <span>
                    <strong>{money(o.total_cents)}</strong>
                    <small>{statusLabels[o.status]}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="新鲜订单，很快相见"
              text="你的商品已展示给社区顾客，收到预购后会出现在这里。"
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>库存小提醒</h3>
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
                  <strong>{p.name}</strong>
                  <small>
                    剩余 {p.stock} {p.unit}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <div className="stock-all-good">
              <CheckCircle2 size={34} />
              <h3>库存状态良好</h3>
              <p>暂无低库存商品，记得及时核对现场销售。</p>
            </div>
          )}
          <button
            className="button secondary full-width"
            onClick={() => {
              notify("在商品与库存中可以调整每款商品的数量");
              navigate("inventory");
            }}
          >
            检查商品与库存
            <ArrowRight size={16} />
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
  notify: (s: string) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    let cancelled = false;
    setError("");
    api<Product[]>("/retailer/products")
      .then((d) => {
        if (!cancelled) setProducts(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const close = useCallback(() => setEditing(undefined), []);
  const shown = products.filter((p) => p.name.includes(search));
  return (
    <>
      <div className="inventory-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="搜索商品名称…"
            aria-label="搜索库存商品"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="button primary" onClick={() => setEditing(null)}>
          <Plus size={17} />
          上架新商品
        </button>
      </div>
      <div className="panel inventory-panel">
        {loading ? (
          <div className="loading-panel">
            <LoaderCircle className="spin" />
            正在读取库存…
          </div>
        ) : error ? (
          <div className="error-panel" role="alert">
            {error}
          </div>
        ) : !shown.length ? (
          <Empty
            icon={<Sprout />}
            title="这里还没有商品"
            text="上架一份新鲜，让社区的顾客看见它。"
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>商品信息</th>
                  <th>分类</th>
                  <th>单价</th>
                  <th>可预购库存</th>
                  <th>售卖日期</th>
                  <th>状态</th>
                  <th>操作</th>
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
                          <strong>{p.name}</strong>
                          <small>{p.organic ? "有机种植" : "当季新鲜"}</small>
                        </div>
                      </div>
                    </td>
                    <td>{p.category}</td>
                    <td>
                      <strong>{money(p.price_cents)}</strong>
                      <small> / {p.unit}</small>
                    </td>
                    <td>
                      <span
                        className={p.stock < 10 ? "stock-low" : "stock-normal"}
                      >
                        {p.stock} {p.unit}
                      </span>
                    </td>
                    <td>{p.available_date}</td>
                    <td>
                      <span
                        className={`status-badge ${p.active && p.available_date === today ? "status-confirmed" : "status-cancelled"}`}
                      >
                        {!p.active
                          ? "已下架"
                          : p.available_date === today
                            ? "今日在售"
                            : "非今日售卖"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditing(p)}
                      >
                        编辑
                        <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="helper-text inventory-help">
        库存为当前可预购数量；提交预购时自动扣减，取消订单时自动归还。价格与库存以数据库记录为准。
      </p>
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
  const [error, setError] = useState("");
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={p ? "编辑这份新鲜" : "上架一份新鲜"}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={save} className="form-stack">
        <fieldset className="form-fields form-stack" disabled={busy}>
          <label>
            商品名称
            <input
              required
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：刚采收的田园番茄"
            />
          </label>
          <div className="form-row">
            <label>
              蔬菜分类
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {["叶菜类", "根茎类", "果实类"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              商品插画
              <select value={art} onChange={(e) => setArt(e.target.value)}>
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
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              售价（USD）
              <input
                required
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              计价单位
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {["磅", "颗", "把", "个", "袋"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              可预购库存
              <input
                required
                type="number"
                min="0"
                max="10000"
                step="1"
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
              />
            </label>
            <label>
              售卖日期（美国东部）
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <label>
            关于这份新鲜
            <textarea
              maxLength={500}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="介绍产地、口感或推荐做法…"
            />
          </label>
          <div className="form-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={organic}
                onChange={(e) => setOrganic(e.target.checked)}
              />
              有机种植
            </label>
            <label>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              上架展示
            </label>
          </div>
          <p className="helper-text">
            售卖日期为今天且已上架的商品，才会出现在顾客端。今日调价会更新今日历史价格记录。
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full-width" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            {busy ? "正在保存…" : "保存商品"}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}

export default App;
