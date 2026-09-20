import { defineConfig, devices } from "@playwright/test";

const appPort = process.env.E2E_APP_PORT ?? "4500";
const apiPort = process.env.E2E_API_PORT ?? "4000";
const appURL = `http://localhost:${appPort}`;
const apiURL = `http://localhost:${apiPort}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/limits.spec.ts",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: appURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:server",
      url: apiURL,
      reuseExistingServer: true,
      env: { PORT: apiPort, MAX_CAPTURES: "100" },
    },
    {
      command: `npm run dev:vite -- --port ${appPort}`,
      url: appURL,
      reuseExistingServer: true,
      env: { BACKEND_PORT: apiPort },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
