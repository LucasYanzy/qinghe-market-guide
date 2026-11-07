import { useEffect, useState } from "react";
import { BarChart3, RotateCcw, Sprout, X } from "lucide-react";
import { api } from "../api";
import { useLanguage } from "../i18n";
import type { Role, User } from "../types";
import { clearDemo, storageAvailable } from "./state";
import "./demo-controls.css";

export const browserDemo = import.meta.env.VITE_BROWSER_DEMO === "true";
type AnalyticsSample = { from: string; to: string; orders: number; sessions: number };

export function DemoAnalyticsData({ onLoaded }: { onLoaded: () => void }) {
  const { t } = useLanguage();
  const [sample, setSample] = useState<AnalyticsSample | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!browserDemo) return;
    let current = true;
    api<{ sample: AnalyticsSample | null }>("/demo/analytics").then(value => { if (current) setSample(value.sample); })
      .catch(() => { if (current) setError("无法读取样本状态，请重试。"); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  if (!browserDemo) return null;
  return <section className="demo-analytics-data" aria-label={t("数据演示")} aria-busy={busy || loading}>
    <BarChart3 size={21} aria-hidden="true" /><div><strong>{t(sample ? "历史样本已载入" : "让报表先有一段可探索的历史")}</strong>
      <p>{t(sample ? "图表包含合成历史样本和本标签页的操作；切换身份可继续同一份体验。" : "载入近 12 周的模拟交易、收款与销售填报，体验趋势、复购和付款占比。保留当前订单、库存与设置。")}</p>
      {sample && <small>{sample.from} — {sample.to} · {t("{orders} 笔样本订单 · {sessions} 场样本", sample)}</small>}
      {error && <p role="alert">{t(error)}</p>}
    </div>
    {!sample && <button className="button" disabled={busy || loading} onClick={async () => {
      setBusy(true); setError("");
      try { const value = await api<{ sample: AnalyticsSample }>("/demo/analytics", { method: "POST", body: "{}" }); setSample(value.sample); onLoaded(); }
      catch { setError("无法载入演示样本，请确认演示商品可用后重试。"); }
      finally { setBusy(false); }
    }}>{t(busy ? "正在载入…" : "载入历史样本")}</button>}
  </section>;
}
const roles: { id: Role; zh: string; en: string }[] = [
  { id: "client", zh: "顾客", en: "Customer" },
  { id: "retailer", zh: "商户", en: "Vendor" },
  { id: "admin", zh: "学校", en: "University" },
];
export async function switchDemoRole(role: Role) {
  return (await api<{ user: User }>("/demo/role", { method: "POST", body: JSON.stringify({ role }) })).user;
}
export function DemoToolbar({ user, onUser }: { user: User | null; onUser: (user: User) => void }) {
  const { language } = useLanguage();
  const en = language === "en";
  const [saved, setSaved] = useState(storageAvailable);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setSaved(storageAvailable);
    window.addEventListener("qinghe-demo-storage", update);
    return () => window.removeEventListener("qinghe-demo-storage", update);
  }, []);
  const choose = async (role: Role) => {
    setBusy(true); setError("");
    try { onUser(await switchDemoRole(role)); }
    catch { setError(en ? "Unable to switch. Try again." : "切换失败，请重试。"); }
    finally { setBusy(false); }
  };
  return <div className="interactive-demo-toolbar">
    <div className="interactive-demo-label"><Sprout size={18} /><strong>{en ? "Interactive demo" : "自由体验 Demo"}</strong><small>{en ? "No sign-in · Your own sample data" : "免登录 · 独立演示数据"}</small></div>
    <div className="interactive-demo-roles" role="group" aria-label={en ? "Demo role" : "体验身份"}>
      {roles.map((role) => <button key={role.id} disabled={busy} aria-pressed={user?.role === role.id} onClick={() => void choose(role.id)}>{en ? role.en : role.zh}</button>)}
    </div>
    <button className="interactive-demo-reset" onClick={() => setReset(true)}><RotateCcw size={15} />{en ? "Reset" : "重置"}</button>
    {!saved && <span role="status">{en ? "Storage unavailable; changes last until refresh." : "浏览器存储不可用，刷新后重置。"}</span>}
    {error && <span role="alert">{error}</span>}
    {reset && <div className="demo-reset-overlay"><section role="dialog" aria-modal="true" aria-labelledby="demo-reset-title"><h2 id="demo-reset-title">{en ? "Reset this demo?" : "重置当前体验？"}</h2><p>{en ? "This clears sample orders and changes in this tab. Other visitors are unaffected." : "将清空当前标签页的演示订单和修改，其他访客不受影响。"}</p><button autoFocus onClick={() => setReset(false)}>{en ? "Keep exploring" : "继续体验"}</button><button onClick={() => { clearDemo(); location.assign(import.meta.env.BASE_URL); }}>{en ? "Reset demo" : "确认重置"}</button></section></div>}
  </div>;
}
export function DemoRolePicker({ onUser, onClose }: { onUser: (user: User) => void; onClose: () => void }) {
  const { language } = useLanguage();
  const en = language === "en";
  const [busy, setBusy] = useState(false);
  return <div className="demo-reset-overlay"><section role="dialog" aria-modal="true" aria-label={en ? "Choose a demo role" : "选择体验身份"}>
    <button className="demo-picker-close" aria-label={en ? "Close" : "关闭"} onClick={onClose}><X size={20} /></button><h2>{en ? "Choose your perspective" : "选择一个身份，直接体验"}</h2>
    <p>{en ? "No account or password needed. Changes stay in this browser tab." : "无需账号和密码，操作保留在当前浏览器标签页。"}</p>
    {roles.map((role) => <button disabled={busy} key={role.id} onClick={async () => { setBusy(true); try { onUser(await switchDemoRole(role.id)); } finally { setBusy(false); } }}>{en ? role.en : role.zh}</button>)}
  </section></div>;
}
