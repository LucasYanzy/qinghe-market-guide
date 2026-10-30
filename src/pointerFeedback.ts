import { useEffect } from "react";

const controls = ".button, .add-button, .quantity-control button, .category-tabs button, .order-tabs button, .icon-button, .basket-dock, .filter-chip";

// A single delegated listener and one short compositor animation, only on mouse presses.
// Native clicks and focus never wait for feedback; no document-wide mousemove loop.
export function usePointerFeedback(scope: string) {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active: { layer: HTMLElement; animation: Animation } | undefined;
    const clear = () => {
      const previous = active;
      active = undefined;
      previous?.animation.cancel();
      previous?.layer.remove();
    };
    const press = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary || preference.matches) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(controls) : null;
      if (!target || !target.animate || target.matches(":disabled, [aria-disabled='true']") ||
        target.closest("[inert], [aria-busy='true']")) return;
      clear();
      const rect = target.getBoundingClientRect();
      const size = Math.min(160, Math.max(rect.width, rect.height) * 1.5);
      const layer = document.createElement("span");
      layer.className = "pointer-feedback";
      layer.setAttribute("aria-hidden", "true");
      const dot = document.createElement("span");
      dot.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left}px;top:${event.clientY - rect.top}px`;
      layer.append(dot);
      target.append(layer);
      const animation = dot.animate([
        { transform: "translate(-50%, -50%) scale(.15)", opacity: .2 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
      ], { duration: 360, easing: "ease-out" });
      active = { layer, animation };
      const finish = () => {
        layer.remove();
        if (active?.layer === layer) active = undefined;
      };
      animation.finished.then(finish, finish);
    };
    const visibility = () => { if (document.hidden) clear(); };
    document.addEventListener("pointerdown", press, { passive: true });
    document.addEventListener("pointercancel", clear);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear, { passive: true });
    window.addEventListener("scroll", clear, { passive: true, capture: true });
    preference.addEventListener("change", clear);
    return () => {
      clear();
      document.removeEventListener("pointerdown", press);
      document.removeEventListener("pointercancel", clear);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", clear);
      window.removeEventListener("scroll", clear, true);
      preference.removeEventListener("change", clear);
    };
  }, [scope]);
}
