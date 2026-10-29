import { useCallback, useEffect, useState, type ReactNode } from "react";

export const pagePaths = {
  discover: "/",
  markets: "/markets",
  prices: "/prices",
  orders: "/orders",
  about: "/about",
  help: "/help",
  dashboard: "/retailer",
  inventory: "/retailer/inventory",
} as const;
export type Page = keyof typeof pagePaths;
export type Route = Page | "not-found";

function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return (
    (Object.keys(pagePaths) as Page[]).find(
      (page) => pagePaths[page] === path,
    ) ?? "not-found"
  );
}

export function useNavigation() {
  const [page, setPage] = useState<Route>(currentRoute);
  const changePage = useCallback((next: Page, replace = false) => {
    const url = pagePaths[next];
    if (
      window.location.pathname !== url ||
      window.location.search ||
      window.location.hash
    ) {
      window.history[replace ? "replaceState" : "pushState"](null, "", url);
    }
    setPage(next);
    window.dispatchEvent(new Event("qinghe:navigate"));
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const navigate = useCallback((next: Page) => changePage(next), [changePage]);
  const replacePage = useCallback(
    (next: Page) => changePage(next, true),
    [changePage],
  );
  useEffect(() => {
    const restore = () => {
      setPage(currentRoute());
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  return { page, navigate, replacePage };
}

export function PageLink({
  page,
  navigate,
  children,
  className,
  active,
}: {
  page: Page;
  navigate: (page: Page) => void;
  children: ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <a
      href={pagePaths[page]}
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(page);
      }}
    >
      {children}
    </a>
  );
}
