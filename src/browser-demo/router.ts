type Handler = (...args: any[]) => any;
type Layer = { method?: string; path: string; handler: Handler | DemoRouter };

// A small in-browser dispatcher for the existing Express route definitions.
// Only the methods used by this project are supported; it never opens a port.
export class DemoRouter {
  layers: Layer[] = [];
  use(path: string | Handler | DemoRouter, ...handlers: (Handler | DemoRouter)[]) {
    if (typeof path !== "string") { handlers.unshift(path); path = ""; }
    for (const handler of handlers) this.layers.push({ path, handler });
    return this;
  }
  route(method: string, path: string, handlers: Handler[]) {
    for (const handler of handlers) this.layers.push({ method, path, handler });
    return this;
  }
  get(path: string, ...handlers: Handler[]) { return this.route("GET", path, handlers); }
  post(path: string, ...handlers: Handler[]) { return this.route("POST", path, handlers); }
  put(path: string, ...handlers: Handler[]) { return this.route("PUT", path, handlers); }
  patch(path: string, ...handlers: Handler[]) { return this.route("PATCH", path, handlers); }
  delete(path: string, ...handlers: Handler[]) { return this.route("DELETE", path, handlers); }
  disable(_key: string) { return this; }
  set(_key: string, _value: unknown) { return this; }
  async dispatch(req: any, res: any, final: (error?: any) => any, initialError?: any): Promise<void> {
    let index = 0;
    const next = async (error?: any): Promise<void> => {
      if (res.finished) return;
      const layer = this.layers[index++];
      if (!layer) return final(error);
      const { method, path, handler } = layer;
      if (method && method !== req.method) return next(error);
      const keys: string[] = [];
      const expression = path.split("/").map((part) => {
        if (part.startsWith(":")) { keys.push(part.slice(1)); return "([^/]+)"; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }).join("/");
      const match = new RegExp(`^${expression}${method ? "/?$" : "(?=/|$)"}`).exec(req.path);
      if (path && !match) return next(error);
      if (handler instanceof DemoRouter) {
        const previousPath = req.path;
        req.path = req.path.slice(path.length) || "/";
        try { await handler.dispatch(req, res, async (nestedError?: any) => { req.path = previousPath; await next(nestedError); }, error); }
        finally { req.path = previousPath; }
        return;
      }
      const isErrorHandler = handler.length === 4;
      if (Boolean(error) !== isErrorHandler) return next(error);
      const previousParams = req.params;
      if (method && match) req.params = Object.fromEntries(keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
      let continued: Promise<void> | undefined;
      const proceed = (nextError?: any) => { continued = next(nextError); return continued; };
      try {
        await (isErrorHandler ? handler(error, req, res, proceed) : handler(req, res, proceed));
        if (continued) await continued;
      } catch (caught) { await next(caught); }
      finally { req.params = previousParams; }
    };
    await next(initialError);
  }
}
export const Router = () => new DemoRouter();
const express = Object.assign(Router, {
  json: (_options: unknown) => (_req: unknown, _res: unknown, next: Handler) => next(),
  static: (_directory: string, _options: unknown) => (_req: unknown, _res: unknown, next: Handler) => next(),
});
export default express;
