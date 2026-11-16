import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/ui",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5186",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5186",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      OPERATIONS_DATABASE:
        process.env.OPERATIONS_DATABASE ??
        "/tmp/qinghe-operations-ui-" + Date.now() + ".sqlite",
    },
  },
});
