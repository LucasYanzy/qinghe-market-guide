import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight, ShoppingBag } from "lucide-react";
import { useLanguage } from "./i18n";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easing = "cubic-bezier(.22, 1, .36, 1)";

// Content is visible by default, including when observers or animations are unavailable.
export function usePageMotion(page: string, ready: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!ready || !root || !root.animate || !window.IntersectionObserver) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver((entries) => {
      let stagger = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (preference.matches) continue;
        const animation = entry.target.animate(
          [{ opacity: 0, translate: "0 16px" }, { opacity: 1, translate: "0 0" }],
          { duration: 520, delay: Math.min(stagger++ * 55, 165), easing },
        );
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      }
    }, { threshold: 0.08 });
    root.querySelectorAll(
      ".page-heading, .hero, .benefits, .section-heading, .product-card, .market-strip, .preorder-steps article, .official-location-card, .about-intro, .visit-checklist, .order-card, .stat-card, .empty-state",
    ).forEach((element) => observer.observe(element));
    const stop = () => {
      if (preference.matches) animations.forEach((animation) => animation.cancel());
    };
    preference.addEventListener("change", stop);
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      preference.removeEventListener("change", stop);
    };
  }, [page, ready]);
  return ref;
}

// Animate the existing nodes so filtering and sorting preserve keyboard focus.
export function MotionGrid({ children, layoutKey }: { children: ReactNode; layoutKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, { x: number; y: number }>());
  const previousWidth = useRef(0);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const positions = new Map<string, { x: number; y: number }>();
    const animations: Animation[] = [];
    const width = root.clientWidth;
    const sameWidth = previousWidth.current === width;
    previousWidth.current = width;
    Array.from(root.children).forEach((child, index) => {
      const element = child as HTMLElement;
      const id = element.dataset.productId!;
      const next = { x: element.offsetLeft, y: element.offsetTop };
      positions.set(id, next);
      if (!element.animate || reducedMotion() || !previous.current.size || !sameWidth) return;
      const last = previous.current.get(id);
      const dx = last ? last.x - next.x : 0;
      const dy = last ? last.y - next.y : 12;
      if (last && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      animations.push(element.animate(
        [{ translate: `${dx}px ${dy}px`, opacity: last ? 1 : 0 }, { translate: "0 0", opacity: 1 }],
        { duration: 360, delay: last ? 0 : Math.min(index * 35, 140), easing },
      ));
    });
    previous.current = positions;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (preference.matches) animations.forEach((animation) => animation.cancel());
    };
    preference.addEventListener("change", stop);
    return () => {
      animations.forEach((animation) => animation.cancel());
      preference.removeEventListener("change", stop);
    };
  }, [layoutKey]);
  return <div ref={ref} className="product-grid">{children}</div>;
}

export function InteractiveHero({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mouse = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    let frame = 0;
    let point = { x: 0, y: 0 };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      hero.style.removeProperty("--art-x");
      hero.style.removeProperty("--art-y");
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.buttons || preference.matches || !mouse.matches) return;
      point = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = hero.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = ((point.x - rect.left) / rect.width - 0.5) * 14;
        const y = ((point.y - rect.top) / rect.height - 0.5) * 10;
        hero.style.setProperty("--art-x", `${Math.max(-7, Math.min(7, x))}px`);
        hero.style.setProperty("--art-y", `${Math.max(-5, Math.min(5, y))}px`);
      });
    };
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", reset);
    hero.addEventListener("pointerdown", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("resize", reset, { passive: true });
    preference.addEventListener("change", reset);
    mouse.addEventListener("change", reset);
    return () => {
      reset();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", reset);
      hero.removeEventListener("pointerdown", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener("resize", reset);
      preference.removeEventListener("change", reset);
      mouse.removeEventListener("change", reset);
    };
  }, []);
  return (
    <section ref={ref} className="hero">{children}</section>
  );
}

export function ScrollActions({ count, total, onCart, page, retailer, inert }: {
  count: number;
  total: string;
  onCart: () => void;
  page: string;
  retailer: boolean;
  inert: boolean;
}) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  // A click can arrive before the browser dispatches its pending scroll event.
  // Expose the dock during the cart commit, before the flight measures its target.
  useLayoutEffect(() => setVisible(window.scrollY > 420), [count]);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 420);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [page]);
  if (!visible) return null;
  return (
    <div className="scroll-actions" inert={inert}>
      {!!count && !retailer && (
        <button className="basket-dock" onClick={onCart} aria-label={t("打开购物袋，已选 {0} 件", { 0: count })}>
          <span className="dock-icon cart-target" data-cart-target><ShoppingBag size={20} /><span key={count}>{count}</span></span>
          <span className="dock-copy"><strong>{t("选好的新鲜")}</strong><small>{t("预估 ")}<span className="value-update" key={total}>{total}</span></small></span>
          <span className="dock-action">{t("查看购物袋")}<ArrowUpRight size={17} /></span>
        </button>
      )}
      <button className="back-to-top" aria-label={t("返回顶部")} title={t("返回顶部")} onClick={() => {
        window.scrollTo({ top: 0, behavior: reducedMotion() ? "instant" : "smooth" });
        document.getElementById("main-content")?.focus({ preventScroll: true });
      }}><ArrowUp size={19} /></button>
    </div>
  );
}
