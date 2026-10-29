import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translate, type Language, type Message, type Parameters } from "./translations/translate";

export type { Language, Message } from "./translations/translate";
const storageKey = "qinghe-language";
type Translator = (text: Message | null | undefined, values?: Parameters) => string;

function readLanguage(): Language {
  try {
    return localStorage.getItem(storageKey) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translator;
} | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>(readLanguage);
  const setLanguage = (next: Language) => {
    updateLanguage(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Switching remains available when the browser blocks local storage.
    }
  };
  const t = useMemo<Translator>(
    () => (text, values) => translate(language, text, values),
    [language],
  );
  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      language === "en"
        ? "Rutgers Community Farmers Market: discover fresh vegetables, preorder for pickup, and explore markets and price trends."
        : "Rutgers 社区农夫市集：发现当日新鲜蔬菜、预购自提、查看市场和价格趋势。",
    );
  }, [language]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) updateLanguage(readLanguage());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage requires LanguageProvider");
  return context;
}

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div className="language-switcher" role="group" aria-label={t("界面语言")}>
      <button type="button" lang="zh-CN" aria-label="切换为中文" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>
        中文
      </button>
      <button type="button" lang="en" aria-label="Switch to English" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>
        EN
      </button>
    </div>
  );
}
