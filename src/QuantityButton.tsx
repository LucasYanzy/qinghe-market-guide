import { forwardRef, useEffect, useLayoutEffect, useRef, type ButtonHTMLAttributes, type PointerEvent } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "onPointerDown" | "onPointerLeave" | "onPointerCancel"> & {
  onStep: (button: HTMLButtonElement, repeated: boolean) => void;
};
type Press = { button: HTMLButtonElement; timer: number; dispose: () => void };

// One timeout per active mouse press, with no catch-up work after a slow frame.
// Touch and keyboard keep their native click behavior.
export const QuantityButton = forwardRef<HTMLButtonElement, Props>(function QuantityButton({ onStep, disabled, ...props }, ref) {
  const latest = useRef(onStep);
  const press = useRef<Press | null>(null);
  const suppressClick = useRef(false);
  const stop = (cancelClick = false) => {
    const current = press.current;
    if (!current) return;
    press.current = null;
    if (cancelClick) suppressClick.current = true;
    window.clearTimeout(current.timer);
    current.button.removeAttribute("data-repeating");
    current.dispose();
  };
  useLayoutEffect(() => {
    latest.current = onStep;
    if (disabled) stop(true);
  }, [onStep, disabled]);
  useEffect(() => () => stop(true), []);

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || disabled) return;
    stop(true);
    suppressClick.current = false;
    if (event.pointerType !== "mouse") return;
    const button = event.currentTarget;
    const pointerId = event.pointerId;
    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    const containers: { element: HTMLElement; x: number; y: number }[] = [];
    for (let element = button.parentElement; element; element = element.parentElement)
      containers.push({ element, x: element.scrollLeft, y: element.scrollTop });
    const release = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId && e.button === 0) stop(); };
    const cancel = () => stop(true);
    const visibility = () => { if (document.hidden) cancel(); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    const tick = () => {
      const current = press.current;
      if (!current) return;
      if (!button.isConnected || button.matches(":disabled") || button.closest("[inert]") || document.hidden) return stop(true);
      // A scroll can precede its queued event, especially on a slow device.
      if (scrollPosition.x !== window.scrollX || scrollPosition.y !== window.scrollY ||
        containers.some(({ element, x, y }) => element.scrollLeft !== x || element.scrollTop !== y)) return stop(true);
      suppressClick.current = true;
      button.setAttribute("data-repeating", "");
      latest.current(button, true);
      if (press.current === current) current.timer = window.setTimeout(tick, 140);
    };
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel, { passive: true });
    window.addEventListener("scroll", cancel, { passive: true, capture: true });
    window.addEventListener("wheel", cancel, { passive: true });
    press.current = {
      button,
      timer: window.setTimeout(tick, 450),
      dispose: () => {
        document.removeEventListener("pointerup", release, true);
        document.removeEventListener("pointercancel", cancel);
        document.removeEventListener("visibilitychange", visibility);
        document.removeEventListener("keydown", escape);
        window.removeEventListener("blur", cancel);
        window.removeEventListener("resize", cancel);
        window.removeEventListener("scroll", cancel, true);
        window.removeEventListener("wheel", cancel);
      },
    };
  };
  return <button
    {...props}
    type="button"
    ref={ref}
    disabled={disabled}
    onPointerDown={start}
    onPointerLeave={() => stop(true)}
    onPointerCancel={() => stop(true)}
    onClick={(event) => {
      // A completed hold must not add a final click on release. Keyboard clicks have detail=0.
      const suppressed = suppressClick.current && event.detail !== 0;
      suppressClick.current = false;
      if (!suppressed) latest.current(event.currentTarget, false);
    }}
  />;
});
