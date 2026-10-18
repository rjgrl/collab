import { defineConfig, devices } from "@playwright/test";
const bin = (name: string) =>
  process.platform === "win32" ? `node_modules\\.bin\\${name}.cmd` : `node_modules/.bin/${name}`;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    {
      command: `${bin("tsx")} apps/server/src/browser-fixture.ts`,
      url: "http://127.0.0.1:3100/health/live",
      reuseExistingServer: false,
      env: { NODE_ENV: "test" },
    },
    {
      command: `${bin("vp")} run --filter web dev -- --host 127.0.0.1 --port 3101`,
      url: "http://127.0.0.1:3101",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        VITE_SERVER_URL: "http://127.0.0.1:3101",
        API_PROXY_TARGET: "http://127.0.0.1:3100",
      },
    },
  ],
});
