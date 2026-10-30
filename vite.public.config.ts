import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export default defineConfig({
  define: { "import.meta.env.VITE_BROWSER_DEMO": JSON.stringify("true"), "process.env": "{}" },
  resolve: { alias: {
    express: resolve("src/browser-demo/router.ts"),
    "node:sqlite": resolve("src/browser-demo/sqlite.ts"),
    "node:crypto": resolve("src/browser-demo/crypto.ts"),
    "node:fs": resolve("src/browser-demo/filesystem.ts"),
    "node:path": resolve("src/browser-demo/filesystem.ts"),
  } },
  base: process.env.PUBLIC_BASE_PATH ?? "/qinghe-market-guide/",
  plugins: [react(), {
    name: "public-route-documents",
    async closeBundle() {
      const directory = resolve("dist-public");
      const html = await readFile(resolve(directory, "public-site.html"), "utf8");
      // Real documents allow refreshes and links opened in new tabs on Pages.
      for (const page of ["", "demo", "markets", "prices", "help", "about", "orders", "vendor", "notifications", "retailer", "retailer/inventory", "admin", "admin/markets", "admin/vendors", "admin/impact", "admin/community", "admin/operations", "admin/screen"]) {
        await mkdir(resolve(directory, page), { recursive: true });
        await writeFile(resolve(directory, page, "index.html"), html);
      }
      await writeFile(resolve(directory, "404.html"), html);
      await writeFile(resolve(directory, ".nojekyll"), "");
    },
  }],
  build: { target: "es2022", outDir: "dist-public", rollupOptions: { input: "public-site.html" } },
});
