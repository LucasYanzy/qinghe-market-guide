import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base:
    mode === "public"
      ? (process.env.PUBLIC_BASE_PATH ?? "/qinghe-market-guide/")
      : "./",
  define: {
    "import.meta.env.VITE_OPERATIONS_STORAGE": JSON.stringify(
      mode === "public" ? "browser" : "server",
    ),
  },
  server: {
    port: 5186,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3016" },
  },
  build: {
    outDir: mode === "public" ? "dist-public" : "dist",
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("exceljs")) return "excel";
          if (id.includes("recharts")) return "charts";
        },
      },
    },
  },
}));
