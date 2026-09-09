import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          PUBLIC_ORIGIN: "https://scheduler.example",
          OWNER_SLUG: "alonso",
          SESSION_SECRET: "test-session-secret-at-least-32-characters",
          ENCRYPTION_KEY: "test-encryption-secret-at-least-32-characters",
          ADMIN_EMAIL: "owner@example.com",
          RESEND_API_KEY: "test-key",
          EMAIL_FROM: "Scheduler <bookings@example.com>",
          TURNSTILE_SITE_KEY: "test-site",
          TURNSTILE_SECRET_KEY: "test-secret",
          GOOGLE_CLIENT_ID: "test-client",
          GOOGLE_CLIENT_SECRET: "test-client-secret",
          ZOOM_CLIENT_ID: "test-zoom-client",
          ZOOM_CLIENT_SECRET: "test-zoom-client-secret",
        },
      },
    }),
  ],
  test: { include: ["worker/test/**/*.test.ts"], testTimeout: 30_000 },
});
