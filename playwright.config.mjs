import { defineConfig } from "@playwright/test";

const remoteBaseURL = process.env.E2E_BASE_URL?.trim();
const localBaseURL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: remoteBaseURL || localBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  ...(remoteBaseURL
    ? {}
    : {
        webServer: {
          command: "npm run preview -- --host 127.0.0.1 --port 4173",
          url: localBaseURL,
          reuseExistingServer: false,
          timeout: 30_000,
          env: {
            ...process.env,
            VITE_PAYMENT_E2E_MODE: "true",
          },
        },
      }),
});
