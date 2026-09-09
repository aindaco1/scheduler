import {
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from "@dustwave/worker-core/crypto";
import { fetchWithTimeout } from "@dustwave/worker-core/provider-fetch";
import { readBoundedText } from "@dustwave/worker-core/request-validation";
import { AppError } from "./model";

export { randomToken, sha256Hex, timingSafeEqual };
export function requireSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32) throw new AppError("setup_required", 503);
  return secret;
}
export async function seal(value: unknown, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(requireSecret(secret)),
    ),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...bytes));
}
export async function unseal<T>(value: string, secret: string): Promise<T> {
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(requireSecret(secret)),
    ),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const data = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: data.slice(0, 12) },
        key,
        data.slice(12),
      ),
    ),
  );
}
export async function boundedJson<T>(
  response: Response,
  limit = 2_000_000,
): Promise<T> {
  const request = new Request("https://bounded.internal/", {
    method: "POST",
    body: response.body,
  });
  return JSON.parse(await readBoundedText(request, limit));
}
export async function checkTurnstile(
  secret: string | undefined,
  token: string,
  action: string,
  origin: string,
  ip: string,
) {
  if (!secret) throw new AppError("setup_required", 503);
  if (!token || token.length > 2048) throw new AppError("challenge_required");
  let result: { success?: boolean; hostname?: string; action?: string };
  try {
    const response = await fetchWithTimeout(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          response: token,
          remoteip: ip || undefined,
          idempotency_key: crypto.randomUUID(),
        }),
      },
      10_000,
    );
    if (!response.ok) throw new Error("verification");
    result = await boundedJson(response, 16_384);
  } catch {
    throw new AppError("challenge_unavailable", 503, true);
  }
  const local = ["localhost", "127.0.0.1"].includes(new URL(origin).hostname);
  const testKey = secret === "1x0000000000000000000000000000000AA";
  if (
    !(local && testKey) &&
    (result.hostname !== new URL(origin).hostname || result.action !== action)
  )
    throw new AppError("challenge_failed");
  if (!result.success || (!local && testKey))
    throw new AppError("challenge_failed");
}
