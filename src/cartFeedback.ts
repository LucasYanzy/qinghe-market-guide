import { useCallback, useLayoutEffect, useRef } from "react";

const motionQuery = "(prefers-reduced-motion: reduce)";
const flightLimit = 3;
const radius = 11;
type Point = { x: number; y: number };

function visibleCenter(element: Element): Point | undefined {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  if (rect.width && rect.height && x > 0 && x < innerWidth && y > 0 && y < innerHeight)
    return { x, y };
}

function cartTarget() {
  for (const selector of [
    ".detail-cart-actions [data-cart-target]",
    ".basket-dock [data-cart-target]",
    ".cart-button [data-cart-target]",
  ]) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && !element.closest("[inert]")) {
      const center = visibleCenter(element);
      if (center) return { element, center };
    }
  }
}

// Native transform/opacity animations, bounded to three concurrent flights.
// Cart updates never wait for visual effects. No artwork clones or per-frame JS.
export function useCartFeedback(scope: string, count: number) {
  const layer = useRef<HTMLDivElement | null>(null);
  const queue = useRef<HTMLElement[]>([]);
  const frames = useRef(new Set<number>());
  const flights = useRef(new Set<Animation>());
  const particles = useRef(new Set<HTMLElement>());
  const pulses = useRef(new Map<HTMLElement, Animation>());
  const scrollPosition = useRef({ x: 0, y: 0 });
  const previousCount = useRef(count);

  const track = useCallback((target: HTMLElement, animation: Animation) => {
    pulses.current.get(target)?.cancel();
    pulses.current.set(target, animation);
    const finish = () => { if (pulses.current.get(target) === animation) pulses.current.delete(target); };
    animation.finished.then(finish, finish);
  }, []);

  const clear = useCallback(() => {
    queue.current = [];
    frames.current.forEach(cancelAnimationFrame);
    frames.current.clear();
    flights.current.forEach((animation) => animation.cancel());
    flights.current.clear();
    pulses.current.forEach((animation) => animation.cancel());
    pulses.current.clear();
    particles.current.forEach((element) => element.remove());
    particles.current.clear();
  }, []);

  useLayoutEffect(() => {
    const overlay = document.createElement("div");
    overlay.className = "cart-flight-layer";
    overlay.setAttribute("aria-hidden", "true");
    document.body.append(overlay);
    layer.current = overlay;
    const preference = window.matchMedia(motionQuery);
    const stop = () => { if (preference.matches) clear(); };
    const visibility = () => { if (document.hidden) clear(); };
    const scroll = (event: Event) => {
      const position = { x: window.scrollX, y: window.scrollY };
      if (event.target !== document || position.x !== scrollPosition.current.x || position.y !== scrollPosition.current.y)
        clear();
      scrollPosition.current = position;
    };
    window.addEventListener("scroll", scroll, { passive: true, capture: true });
    window.addEventListener("resize", clear, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    preference.addEventListener("change", stop);
    return () => {
      clear();
      overlay.remove();
      layer.current = null;
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", clear);
      document.removeEventListener("visibilitychange", visibility);
      preference.removeEventListener("change", stop);
    };
  }, [scope, clear]);

  // Flush after the cart commit so the first add has a real, stable destination.
  useLayoutEffect(() => {
    const added = Math.max(0, count - previousCount.current);
    previousCount.current = count;
    const sources = queue.current.splice(0).slice(0, added);
    for (const source of sources) {
      const frame = requestAnimationFrame(() => {
        frames.current.delete(frame);
        const destination = cartTarget();
        const origin = source.isConnected && visibleCenter(source);
        const overlay = layer.current;
        if (!destination || !origin || !overlay || window.matchMedia(motionQuery).matches) return;
        scrollPosition.current = { x: window.scrollX, y: window.scrollY };
        const { element: target, center: end } = destination;
        const distance = Math.hypot(end.x - origin.x, end.y - origin.y);
        const lift = Math.min(115, Math.max(55, distance * 0.25));
        const control = { x: origin.x + (end.x - origin.x) * 0.35, y: Math.max(20, Math.min(origin.y, end.y) - lift) };
        const dot = document.createElement("span");
        dot.className = "cart-flight-dot";
        dot.textContent = "+1";
        overlay.append(dot);
        particles.current.add(dot);
        track(source, source.animate([
          { scale: ".82" }, { scale: "1.1", offset: 0.5 }, { scale: "1" },
        ], { duration: 240, easing: "ease-out" }));

        const keyframes: Keyframe[] = Array.from({ length: 21 }, (_, index) => {
          const t = index / 20;
          const x = (1 - t) ** 2 * origin.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x;
          const y = (1 - t) ** 2 * origin.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y;
          const scale = t < 0.2 ? 0.7 + t * 2.5 : t < 0.8 ? 1.2 : 1.2 - (t - 0.8) * 4.5;
          return {
            offset: t,
            transform: `translate3d(${x - radius}px, ${y - radius}px, 0) scale(${scale})`,
            opacity: t > 0.9 ? (1 - t) * 10 : 1,
          };
        });
        const animation = dot.animate(keyframes, {
          duration: Math.min(880, Math.max(680, distance * 0.7 + 420)),
          easing: "cubic-bezier(.22, .1, .5, 1)",
          fill: "both",
        });
        flights.current.add(animation);
        const remove = () => {
          flights.current.delete(animation);
          particles.current.delete(dot);
          dot.remove();
        };
        animation.finished.then(() => {
          remove();
          if (!target.isConnected || !layer.current || window.matchMedia(motionQuery).matches) return;
          track(target, target.animate([
            { transform: "scale(1) rotate(0)" },
            { transform: "scale(1.35) rotate(-9deg)", offset: 0.3 },
            { transform: "scale(.95) rotate(6deg)", offset: 0.65 },
            { transform: "scale(1) rotate(0)" },
          ], { duration: 420, easing: "ease-out" }));
          const bag = target.closest("button");
          if (bag) track(bag, bag.animate([
            { translate: "0 0" }, { translate: "0 -4px", offset: 0.35 }, { translate: "0 0" },
          ], { duration: 360, easing: "ease-out" }));
          const receipt = document.createElement("span");
          receipt.className = "cart-receipt";
          receipt.textContent = "+1";
          receipt.style.left = `${end.x + 15}px`;
          receipt.style.top = `${end.y - 32}px`;
          layer.current.append(receipt);
          particles.current.add(receipt);
          const pop = receipt.animate([
            { transform: "translateY(6px) scale(.8)", opacity: 0 },
            { transform: "translateY(-3px) scale(1)", opacity: 1, offset: 0.25 },
            { transform: "translateY(-10px) scale(1)", opacity: 1, offset: 0.7 },
            { transform: "translateY(-16px) scale(.95)", opacity: 0 },
          ], { duration: 650, easing: "ease-out", fill: "both" });
          const finish = () => { particles.current.delete(receipt); receipt.remove(); };
          track(receipt, pop);
          pop.finished.then(finish, finish);
        }, remove);
      });
      frames.current.add(frame);
    }
  }, [count, track]);

  return useCallback((source: HTMLElement) => {
    if (!layer.current || !source.animate || window.matchMedia(motionQuery).matches) return;
    if (flights.current.size + frames.current.size + queue.current.length >= flightLimit) return;
    queue.current.push(source);
    scrollPosition.current = { x: window.scrollX, y: window.scrollY };
  }, []);
}
