import { Bell, CircleHelp, Leaf, LogOut, MapPin, ShoppingBag, Store, UserRound } from "lucide-react";
import { LanguageSwitcher, useLanguage } from "./i18n";
import { PageLink, type Page, type Route } from "./navigation";
import type { User } from "./types";
import "./simple-visitor.css";

// Keep the same three destinations on desktop and mobile.
export const visitorNav = [
  { id: "markets", label: "市场与导航", icon: MapPin },
  { id: "discover", label: "逛逛市集", icon: Store },
  { id: "orders", label: "我的预购", icon: ShoppingBag },
] as const;

export function VisitorHeader({ page, navigate, user, onLogin, onLogout }: {
  page: Route; navigate: (page: Page) => void; user: User | null;
  onLogin: () => void; onLogout: () => void;
}) {
  const { t } = useLanguage();
  return <header className={`visitor-header${user ? " visitor-header-signed-in" : ""}`}>
    <PageLink page="discover" navigate={navigate} className="visitor-brand" >
      <span><Leaf size={23} /></span><strong>{t("青禾")}<small>QINGHE</small></strong>
    </PageLink>
    <nav className="visitor-primary-nav" aria-label={t("主导航")}>
      {visitorNav.map((item) => <PageLink key={item.id} page={item.id} navigate={navigate} active={page === item.id}>
        <item.icon size={17} />{t(item.label)}
      </PageLink>)}
    </nav>
    <div className="visitor-header-actions">
      {user && <PageLink page="notifications" navigate={navigate} className="visitor-notifications" active={page === "notifications"}><Bell size={18} /><span>{t("通知")}</span></PageLink>}
      <PageLink page="help" navigate={navigate} active={page === "help"} className="visitor-help-link"><CircleHelp size={19} /><span>{t("帮助")}</span></PageLink>
      <LanguageSwitcher />
      <button className="visitor-account" onClick={user ? onLogout : onLogin} aria-label={t(user ? "退出登录" : "登录")} title={t(user?.name)}>
        {user ? <LogOut size={17} /> : <UserRound size={17} />}<span>{t(user ? "退出" : "登录")}</span>
      </button>
    </div>
  </header>;
}

export function VisitorFooter({ navigate, onManage }: { navigate: (page: Page) => void; onManage: () => void }) {
  const { t } = useLanguage();
  return <footer className="visitor-footer">
    <span>{t("青禾 QINGHE")} <small>{t("社区市集项目")}</small></span>
    <nav aria-label={t("页脚导航")}>
      <PageLink page="help" navigate={navigate}>{t("帮助")}</PageLink>
      <PageLink page="prices" navigate={navigate}>{t("价格观察")}</PageLink>
      <PageLink page="about" navigate={navigate}>{t("关于青禾")}</PageLink>
      <PageLink page="vendor" navigate={navigate}>{t("商户服务")}</PageLink>
      <button onClick={onManage}>{t("商户与学校登录")}</button>
    </nav>
  </footer>;
}
