import { isPresentationPath, localizedAsset } from "./language";
import { z } from "zod";
import {
  readJsonObject,
  readBoundedBytes,
} from "@dustwave/worker-core/request-validation";
import {
  createSessionCookie,
  clearSessionCookie,
  isTrustedSameOriginRequest,
} from "@dustwave/worker-core/session-security";
import {
  getCookie,
  hmacSha256,
  sha256Hex,
  base64urlEncode,
} from "@dustwave/worker-core/crypto";
import { fetchWithTimeout } from "@dustwave/worker-core/provider-fetch";
import { Scheduler } from "./scheduler";
import { AppError, bookingInput, changeMessageInput } from "./model";
import {
  boundedJson,
  checkTurnstile,
  randomToken,
  requireSecret,
} from "./security";
import type { RuntimeEnv } from "./env";
import { LOGO_MAX_BYTES } from "./logo-policy";
export { Scheduler };

const cookie = "scheduler_session";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function sessionToken(request: Request) {
  try {
    return getCookie(request, cookie);
  } catch {
    return "";
  }
}
function bearer(request: Request) {
  return request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
}
function secure(response: Response, path: string): Response {
  const isApi = path.startsWith("/api/");
  const privatePage = /^\/(?:es\/)?(?:admin|manage)(?:\/|$)/.test(path);
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  headers.set("Strict-Transport-Security", "max-age=31536000");
  // Keep zone-wide script injection from conflicting with this app's CSP.
  // Turnstile is explicitly loaded by the app and remains active.
  if (headers.get("Content-Type")?.includes("text/html")) {
    const policy =
      headers.get("Cache-Control") || "public, max-age=0, must-revalidate";
    headers.set(
      "Cache-Control",
      policy.includes("no-transform") ? policy : policy + ", no-transform",
    );
  }
  if (isApi || privatePage || response.status >= 400)
    headers.set("X-Robots-Tag", "noindex, nofollow");
  if (
    privatePage ||
    (isApi && !headers.get("Content-Type")?.startsWith("image/"))
  )
    headers.set("Cache-Control", "private, no-store, no-transform");
  if (
    response.status === 200 &&
    /^\/assets\/build\/[a-z]+-[A-Za-z0-9_-]+\.(js|css)$/.test(path)
  )
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
async function oauth(
  request: Request,
  env: RuntimeEnv,
  stub: DurableObjectStub<Scheduler>,
  provider: "google" | "zoom",
  callback: boolean,
) {
  const url = new URL(request.url),
    session = sessionToken(request);
  if (!(await stub.session(session)))
    throw new AppError("sign_in_required", 401);
  const redirect = env.PUBLIC_ORIGIN + "/api/admin/callback/" + provider;
  const clientId =
    provider === "google" ? env.GOOGLE_CLIENT_ID : env.ZOOM_CLIENT_ID;
  const secret =
    provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.ZOOM_CLIENT_SECRET;
  if (!clientId || !secret)
    throw new AppError(provider + "_not_configured", 503);
  if (!callback) {
    const verifier = randomToken(48),
      state = await stub.oauthState(provider, session, verifier);
    const target = new URL(
      provider === "google"
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://zoom.us/oauth/authorize",
    );
    target.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirect,
      state,
    }).toString();
    if (provider === "google") {
      target.searchParams.set(
        "scope",
        "openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
      );
      target.searchParams.set("access_type", "offline");
      target.searchParams.set("prompt", "consent");
      target.searchParams.set(
        "code_challenge",
        base64urlEncode(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(verifier),
            ),
          ),
        ),
      );
      target.searchParams.set("code_challenge_method", "S256");
    }
    return Response.redirect(target.href, 302);
  }
  const verifier = await stub.consumeOauth(
    url.searchParams.get("state") || "",
    provider,
    session,
  );
  if (url.searchParams.has("error"))
    return Response.redirect(
      env.PUBLIC_ORIGIN + "/admin/?error=oauth_denied",
      302,
    );
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) throw new AppError("oauth_failed");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
  });
  const headers: Record<string, string> = {};
  if (provider === "google") {
    body.set("client_id", clientId);
    body.set("client_secret", secret);
    body.set("code_verifier", verifier);
  } else headers.Authorization = "Basic " + btoa(clientId + ":" + secret);
  const result = await fetchWithTimeout(
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://zoom.us/oauth/token",
    { method: "POST", headers, body },
    15_000,
  );
  if (!result.ok) throw new AppError("oauth_failed", 503);
  const data = await boundedJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }>(result, 32_768);
  if (!data.access_token || !data.refresh_token)
    throw new AppError("oauth_offline_required", 503);
  if (provider === "google") {
    const response = await fetchWithTimeout(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: "Bearer " + data.access_token } },
      10_000,
    );
    if (!response.ok) throw new AppError("oauth_failed", 503);
    const user = await boundedJson<{ email: string; id: string }>(
      response,
      32_768,
    );
    if (!user.id || !user.email) throw new AppError("oauth_failed", 503);
    await stub.putConnection("google", {
      refreshToken: data.refresh_token,
      email: user.email,
      accountId: user.id,
    });
  } else {
    const response = await fetchWithTimeout(
      "https://api.zoom.us/v2/users/me",
      { headers: { Authorization: "Bearer " + data.access_token } },
      10_000,
    );
    if (!response.ok) throw new AppError("oauth_failed", 503);
    const user = await boundedJson<{ id: string }>(response, 32_768);
    if (!user.id) throw new AppError("oauth_failed", 503);
    await stub.putConnection("zoom", {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expires: Date.now() + (data.expires_in || 3600) * 1000,
      accountId: user.id,
    });
  }
  return Response.redirect(
    env.PUBLIC_ORIGIN + "/admin/?connected=" + provider,
    302,
  );
}

async function route(request: Request, env: RuntimeEnv): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  const stub = env.SCHEDULER.getByName(
    env.OWNER_SLUG,
  ) as DurableObjectStub<Scheduler>;
  if (!path.startsWith("/api/")) {
    if (path === "/")
      return Response.redirect(url.origin + "/" + env.OWNER_SLUG, 302);
    if (
      ["GET", "HEAD"].includes(method) &&
      isPresentationPath(path, env.OWNER_SLUG)
    )
      return localizedAsset(request, env.ASSETS, stub.presentation());
    return env.ASSETS.fetch(request);
  }
  if (method === "OPTIONS") return new Response(null, { status: 405 });
  if (
    !["GET", "HEAD"].includes(method) &&
    !isTrustedSameOriginRequest(request, env.PUBLIC_ORIGIN, {
      allowMissingSource: false,
    })
  )
    throw new AppError("untrusted_origin", 403);
  const body = () => readJsonObject(request, 65_536);
  if (path === "/api/health") return json({ ok: true });
  const logoMatch = path.match(/^\/api\/logo\/([0-9a-f]{64})$/);
  if (logoMatch && method === "GET") return stub.getLogo(logoMatch[1]);
  if (path === "/api/config" && method === "GET")
    return json(await stub.publicConfig());
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (path === "/api/availability" && method === "GET") {
    await stub.rateLimit(
      "availability:" +
        (await hmacSha256(ip, requireSecret(env.SESSION_SECRET))),
      120,
      60_000,
    );
    return json(
      await stub.availability(
        url.searchParams.get("type") || "",
        url.searchParams.get("location") || "",
        Date.parse(url.searchParams.get("from") || ""),
        Date.parse(url.searchParams.get("to") || ""),
        url.searchParams.get("booking") || undefined,
        bearer(request) || undefined,
      ),
    );
  }
  if (path === "/api/bookings" && method === "POST") {
    await stub.rateLimit(
      "booking:" + (await hmacSha256(ip, requireSecret(env.SESSION_SECRET))),
      10,
      10 * 60_000,
    );
    const input = bookingInput.parse(await body());
    await checkTurnstile(
      env.TURNSTILE_SECRET_KEY,
      input.turnstile,
      "booking",
      env.PUBLIC_ORIGIN,
      ip,
    );
    return json(await stub.createBooking(input), 202);
  }
  const bookingMatch = path.match(
    /^\/api\/bookings\/([0-9a-f-]{36})(?:\/(cancel|reschedule))?$/,
  );
  if (bookingMatch) {
    const [, id, action] = bookingMatch;
    if (method === "GET" && !action)
      return json(await stub.getBooking(id, bearer(request)));
    if (method === "POST" && action) {
      const input = await body();
      const token = z.string().max(200).parse(input.token);
      return json(
        action === "cancel"
          ? await stub.cancel(id, token)
          : await stub.reschedule(
              id,
              token,
              z.iso.datetime({ offset: true }).parse(input.start),
              z.string().uuid().parse(input.requestId),
            ),
      );
    }
  }
  if (path === "/api/admin/session" && method === "GET")
    return json({ authenticated: await stub.session(sessionToken(request)) });
  if (path === "/api/admin/login" && method === "POST") {
    await stub.rateLimit(
      "login:" + (await hmacSha256(ip, requireSecret(env.SESSION_SECRET))),
      5,
      15 * 60_000,
    );
    const input = z
      .object({ email: z.email().max(254), turnstile: z.string().max(2048) })
      .parse(await body());
    await checkTurnstile(
      env.TURNSTILE_SECRET_KEY,
      input.turnstile,
      "admin_login",
      env.PUBLIC_ORIGIN,
      ip,
    );
    return json(await stub.createLogin(input.email));
  }
  if (path === "/api/admin/consume" && method === "POST") {
    await stub.rateLimit(
      "consume:" + (await hmacSha256(ip, requireSecret(env.SESSION_SECRET))),
      20,
      15 * 60_000,
    );
    const token = z
      .string()
      .max(200)
      .parse((await body()).token);
    const session = await stub.consumeLogin(token);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": createSessionCookie(cookie, session, {
          requestUrl: request.url,
          maxAgeSeconds: 12 * 3600,
          sameSite: "Lax",
        }),
      },
    });
  }
  if (path.startsWith("/api/admin/")) {
    if (!(await stub.session(sessionToken(request))))
      throw new AppError("sign_in_required", 401);
    if (path === "/api/admin/logo" && method === "POST") {
      await stub.rateLimit("logo-upload", 20, 3_600_000);
      let bytes: Uint8Array;
      try {
        bytes = await readBoundedBytes(request, LOGO_MAX_BYTES);
      } catch (error) {
        if ((error as { code?: string }).code === "body_too_large")
          throw new AppError("logo_too_large", 413);
        throw error;
      }
      return json(
        await stub.uploadLogo(bytes, request.headers.get("Content-Type") || ""),
      );
    }
    if (path === "/api/admin/logout" && method === "POST") {
      await stub.logout(sessionToken(request));
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": clearSessionCookie(cookie, { requestUrl: request.url }),
        },
      });
    }
    if (path === "/api/admin/settings" && method === "GET")
      return json(await stub.getSettings());
    if (path === "/api/admin/settings" && method === "PUT") {
      const data = await body();
      return json(
        await stub.updateSettings(
          data.settings,
          z.number().int().parse(data.revision),
        ),
      );
    }
    if (path === "/api/admin/connections" && method === "GET")
      return json(await stub.connections());
    if (path === "/api/admin/verify" && method === "POST")
      return json(await stub.connections(true));
    if (path === "/api/admin/connections/icloud" && method === "POST") {
      const data = await body();
      return json(
        await stub.connectIcloud(
          z.string().max(254).parse(data.username),
          z.string().max(128).parse(data.password),
        ),
      );
    }
    const connectionMatch = path.match(
      /^\/api\/admin\/connections\/(google|icloud|zoom)$/,
    );
    if (connectionMatch && method === "DELETE")
      return json(await stub.disconnect(connectionMatch[1]));
    const oauthMatch = path.match(
      /^\/api\/admin\/(connect|callback)\/(google|zoom)$/,
    );
    if (oauthMatch && method === "GET")
      return oauth(
        request,
        env,
        stub,
        oauthMatch[2] as "google" | "zoom",
        oauthMatch[1] === "callback",
      );
    if (path === "/api/admin/bookings" && method === "GET")
      return json(await stub.listBookings());
    const actionMatch = path.match(
      /^\/api\/admin\/bookings\/([0-9a-f-]{36})\/(cancel|reschedule)$/,
    );
    if (actionMatch && method === "POST") {
      const input = await body();
      return json(
        actionMatch[2] === "cancel"
          ? await stub.cancel(
              actionMatch[1],
              "",
              true,
              changeMessageInput.parse(input.message),
            )
          : await stub.reschedule(
              actionMatch[1],
              "",
              z.iso.datetime({ offset: true }).parse(input.start),
              z.string().uuid().parse(input.requestId),
              true,
              changeMessageInput.parse(input.message),
            ),
      );
    }
  }
  throw new AppError("not_found", 404);
}
export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    try {
      return secure(await route(request, env), new URL(request.url).pathname);
    } catch (e) {
      // RPC preserves serializable error fields, not custom prototypes/instanceof.
      const remote =
        e && typeof e === "object"
          ? (e as { name?: unknown; code?: unknown; status?: unknown })
          : {};
      const application =
        remote.name === "SchedulerError" &&
        typeof remote.code === "string" &&
        /^[a-z_]{1,80}$/.test(remote.code) &&
        [400, 401, 403, 404, 409, 413, 429, 503].includes(
          Number(remote.status),
        );
      const validation = e instanceof z.ZodError || remote.name === "ZodError";
      const known = application || validation;
      // Log only a bounded classification. Provider errors can contain calendar contents or tokens.
      if (!known)
        console.error(
          JSON.stringify({ event: "request_failed", code: "internal_error" }),
        );
      return secure(
        json(
          {
            error: application
              ? remote.code
              : validation
                ? "invalid_request"
                : "service_unavailable",
          },
          application ? Number(remote.status) : validation ? 400 : 503,
        ),
        new URL(request.url).pathname,
      );
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;
