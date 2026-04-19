import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: {
      width: 1440,
      height: 1100
    }
  },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: true
  }
});
