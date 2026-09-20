import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/fixture",
  testMatch: "limits.spec.ts",
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
  },
  webServer: {
    command: "npm run dev:server",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    env: {
      PORT: "3001",
      MAX_CAPTURES: "20",
    },
  },
});
