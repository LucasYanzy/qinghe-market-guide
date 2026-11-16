import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5186,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3016" },
  },
  build: {
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
});
