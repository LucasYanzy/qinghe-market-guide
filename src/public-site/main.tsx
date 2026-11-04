import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { LanguageProvider } from "../i18n";
import { initializeDemo } from "../browser-demo/runtime";
import "../styles.css";
import "../website.css";
import "../motion.css";
import "../pointer.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);
function start() {
  root.render(<p style={{ padding: 40, textAlign: "center", color: "#355536" }}>正在准备自由体验 · Preparing your demo…</p>);
  initializeDemo().then(() => root.render(<React.StrictMode><LanguageProvider><App /></LanguageProvider></React.StrictMode>)).catch(() => {
    root.render(<div style={{ padding: 40 }}><h1>暂时无法加载体验 / Unable to load demo</h1><p>请刷新重试 / Please refresh and try again.</p><button onClick={() => location.reload()}>重新加载 / Reload</button></div>);
  });
}
start();
