import { defineConfig } from "@playwright/test";

const port = Number(process.env.PUBLIC_TEST_PORT ?? 4178);
export default defineConfig({
  testDir: "./tests/public",
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}/qinghe-market-guide/`,
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  webServer: {
    command: `npm run preview:public -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/qinghe-market-guide/`,
    reuseExistingServer: false,
  },
});
