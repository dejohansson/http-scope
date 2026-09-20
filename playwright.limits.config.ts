import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/fixture",
  testMatch: "limits.spec.ts",
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4001",
  },
  webServer: {
    command: "npm run dev:server",
    url: "http://localhost:4001",
    reuseExistingServer: false,
    env: {
      PORT: "4001",
      MAX_CAPTURES: "20",
    },
  },
});
