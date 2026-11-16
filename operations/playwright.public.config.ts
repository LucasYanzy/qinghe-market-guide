import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/public",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5187/qinghe-market-guide/",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      "npm run build:public && vite preview --mode public --host 127.0.0.1 --port 5187 --strictPort",
    url: "http://127.0.0.1:5187/qinghe-market-guide/",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
