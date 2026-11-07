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

// The highlight follows the selected control; wrapped rows fade in instead of
// sweeping over unrelated labels. The buttons retain their native focus behavior.
export function MotionTabs({ children, activeKey, label }: { children: ReactNode; activeKey: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const animation = useRef<Animation | null>(null);
  const previous = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const position = useRef((animate: boolean) => {
    const root = ref.current, indicator = highlight.current;
    const selected = root?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!root || !indicator || !selected) return;
    const next = { x: selected.offsetLeft, y: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight };
    const last = previous.current;
    if (last && next.x === last.x && next.y === last.y && next.width === last.width && next.height === last.height) return;
    const visual = indicator.getBoundingClientRect();
    const bounds = root.getBoundingClientRect();
    animation.current?.cancel();
    Object.assign(indicator.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.width}px`, height: `${next.height}px` });
    root.dataset.motionReady = "true";
    previous.current = next;
    if (!animate || !last || !indicator.animate || reducedMotion()) return;
    const sameRow = Math.abs(last.y - next.y) < 1;
    animation.current = indicator.animate(sameRow ? [
      { transform: `translate(${visual.left - bounds.left - next.x}px, ${visual.top - bounds.top - next.y}px) scale(${visual.width / next.width}, ${visual.height / next.height})` },
      { transform: "translate(0, 0) scale(1)" },
    ] : [{ opacity: .25 }, { opacity: 1 }], { duration: sameRow ? 280 : 160, easing });
  });
  useLayoutEffect(() => position.current(true), [activeKey, children]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const align = () => position.current(false);
    const stop = () => animation.current?.cancel();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = window.ResizeObserver ? new ResizeObserver(align) : undefined;
    observer?.observe(root);
    root.querySelectorAll("button").forEach((button) => observer?.observe(button));
    window.addEventListener("resize", align, { passive: true });
    preference.addEventListener("change", stop);
    return () => {
      stop();
      observer?.disconnect();
      window.removeEventListener("resize", align);
      preference.removeEventListener("change", stop);
    };
  }, []);
  return <div ref={ref} className="category-tabs motion-tabs" role="group" aria-label={label}>
    <span ref={highlight} className="motion-tabs-indicator" aria-hidden="true" />{children}
  </div>;
}

// Keep nodes and keyboard focus. Capture in-flight offsets before cancelling so
// rapid sorting continues from the visible position instead of snapping back.
export function MotionGrid({ children, layoutKey }: { children: ReactNode; layoutKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, { x: number; y: number }>());
  const previousWidth = useRef(0);
  const animations = useRef(new Map<HTMLElement, Animation>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const positions = new Map<string, { x: number; y: number }>();
    const width = root.clientWidth;
    const sameWidth = previousWidth.current === width;
    previousWidth.current = width;
    const bounds = root.getBoundingClientRect();
    const changes = Array.from(root.children).map((child) => {
      const element = child as HTMLElement;
      const id = element.dataset.productId!;
      const next = { x: element.offsetLeft, y: element.offsetTop };
      positions.set(id, next);
      const last = previous.current.get(id);
      const style = animations.current.has(element) ? getComputedStyle(element) : null;
      const [tx, ty] = style?.translate.split(" ").map((value) => parseFloat(value) || 0) ?? [0, 0];
      const oldY = bounds.top + (last?.y ?? next.y) + (ty ?? 0);
      const nextY = bounds.top + next.y;
      const visible = nextY < innerHeight && nextY + element.offsetHeight > 0;
      const nearby = !!last && oldY < innerHeight && oldY + element.offsetHeight > 0;
      return { element, visible, nearby, dx: last ? last.x - next.x + tx : 0, dy: last ? last.y - next.y + (ty ?? 0) : 12, opacity: style ? Number(style.opacity) : 1 };
    });
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();
    const canAnimate = previous.current.size && sameWidth && !reducedMotion();
    previous.current = positions;
    if (!canAnimate) return;
    let stagger = 0;
    for (const { element, visible, nearby, dx, dy, opacity } of changes) {
      if (!visible || !element.animate || (nearby && Math.abs(dx) < 1 && Math.abs(dy) < 1 && opacity === 1)) continue;
      const travel = nearby && Math.hypot(dx, dy) < innerHeight * .65;
      const animation = element.animate([
        { translate: travel ? `${dx}px ${dy}px` : "0 12px", opacity: travel ? opacity : 0 },
        { translate: "0 0", opacity: 1 },
      ], { duration: travel ? 320 : 240, delay: travel ? 0 : Math.min(stagger++ * 24, 96), easing, fill: "backwards" });
      animations.current.set(element, animation);
      const finish = () => { if (animations.current.get(element) === animation) animations.current.delete(element); };
      animation.finished.then(finish, finish);
    }
  }, [layoutKey]);
  useEffect(() => {
    const clear = () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current.clear();
    };
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visibility = () => { if (document.hidden) clear(); };
    preference.addEventListener("change", clear);
    window.addEventListener("resize", clear, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clear();
      preference.removeEventListener("change", clear);
      window.removeEventListener("resize", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
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
