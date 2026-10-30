import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export default defineConfig({
  base: process.env.PUBLIC_BASE_PATH ?? "/qinghe-market-guide/",
  plugins: [react(), {
    name: "public-route-documents",
    async closeBundle() {
      const directory = resolve("dist-public");
      const html = await readFile(resolve(directory, "public-site.html"), "utf8");
      // Real documents allow refreshes and links opened in new tabs on Pages.
      for (const page of ["", "markets", "prices", "help", "about", "orders", "vendor", "admin"]) {
        await mkdir(resolve(directory, page), { recursive: true });
        await writeFile(resolve(directory, page, "index.html"), html);
      }
      await writeFile(resolve(directory, "404.html"), html);
      await writeFile(resolve(directory, ".nojekyll"), "");
    },
  }],
  build: { outDir: "dist-public", rollupOptions: { input: "public-site.html" } },
});
