import { beforeEach, afterEach, it, expect } from "vitest";
import { checkTurnstile, seal, unseal } from "../src/security";
import { fetchMock } from "./fetch-fixtures";
beforeEach(() => fetchMock.activate());
afterEach(() => {
  try {
    fetchMock.assertConsumed();
  } finally {
    fetchMock.deactivate();
  }
});
const endpoint = () =>
  fetchMock
    .get("https://challenges.cloudflare.com")
    .intercept({ path: "/turnstile/v0/siteverify", method: "POST" });
it.each([
  { success: false, hostname: "scheduler.example", action: "booking" },
  { success: true, hostname: "another.example", action: "booking" },
  { success: true, hostname: "scheduler.example", action: "admin_login" },
  { success: true },
])(
  "rejects unsuccessful or wrong-origin/action Turnstile response %j",
  async (reply) => {
    endpoint().reply(200, reply);
    await expect(
      checkTurnstile(
        "secret",
        "token",
        "booking",
        "https://scheduler.example",
        "127.0.0.1",
      ),
    ).rejects.toMatchObject({ code: "challenge_failed" });
  },
);
it("accepts the matching verified challenge", async () => {
  endpoint().reply(200, {
    success: true,
    hostname: "scheduler.example",
    action: "booking",
  });
  await expect(
    checkTurnstile(
      "secret",
      "token",
      "booking",
      "https://scheduler.example",
      "127.0.0.1",
    ),
  ).resolves.toBeUndefined();
});
it("fails closed when Turnstile cannot be contacted", async () => {
  endpoint().replyWithError(new Error("Fixture outage"));
  await expect(
    checkTurnstile(
      "secret",
      "token",
      "booking",
      "https://scheduler.example",
      "127.0.0.1",
    ),
  ).rejects.toMatchObject({ code: "challenge_unavailable" });
});
it("never accepts the official test secret on a production hostname", async () => {
  endpoint().reply(200, {
    success: true,
    hostname: "scheduler.example",
    action: "booking",
  });
  await expect(
    checkTurnstile(
      "1x0000000000000000000000000000000AA",
      "token",
      "booking",
      "https://scheduler.example",
      "127.0.0.1",
    ),
  ).rejects.toMatchObject({ code: "challenge_failed" });
});
it("encrypts credentials with unique nonces and rejects tampering or another key", async () => {
  const key = "test-secret-at-least-32-characters-long";
  const a = await seal({ password: "fixture-private-value" }, key),
    b = await seal({ password: "fixture-private-value" }, key);
  expect(a).not.toBe(b);
  expect(a).not.toContain("fixture-private-value");
  expect(await unseal(a, key)).toEqual({ password: "fixture-private-value" });
  const bytes = Uint8Array.from(atob(a), (c) => c.charCodeAt(0));
  bytes[20] ^= 1;
  await expect(
    unseal(btoa(String.fromCharCode(...bytes)), key),
  ).rejects.toThrow();
  await expect(
    unseal(a, "another-test-key-at-least-32-characters"),
  ).rejects.toThrow();
});
