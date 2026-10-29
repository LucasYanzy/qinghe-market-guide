import { defineConfig } from "@playwright/test";

const port = Number(process.env.UI_TEST_PORT ?? 3101);

export default defineConfig({
  testDir: "./tests/ui",
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "node tests/ui/server.mjs",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
  },
});
