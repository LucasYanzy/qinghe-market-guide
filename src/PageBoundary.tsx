import { Component, Suspense, type ReactNode } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "./i18n";

class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PageBoundary({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const en = language === "en";
  return <ErrorBoundary fallback={<section className="error-panel" role="alert"><p>{en ? "This page could not load. Reload to try again." : "页面暂时无法加载，请重新加载后再试。"}</p><button className="button primary" onClick={() => window.location.reload()}><RefreshCw size={16} />{en ? "Reload page" : "重新加载页面"}</button></section>}>
    <Suspense fallback={<div className="loading-panel" role="status"><LoaderCircle className="spin" />{en ? "Loading page…" : "正在加载页面…"}</div>}>{children}</Suspense>
  </ErrorBoundary>;
}
