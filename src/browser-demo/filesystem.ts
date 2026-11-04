// The browser demo never reads files or serves assets through the API router.
export const existsSync = () => false;
export const mkdirSync = () => {};
export const sep = "/";
export const join = (...parts: string[]) => parts.join("/");
export const resolve = (...parts: string[]) => "/" + parts.join("/");
export const dirname = (path: string) => path.slice(0, path.lastIndexOf("/"));
