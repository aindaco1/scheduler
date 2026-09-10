import { describe, it, expect } from "vitest";
import { env, SELF, runInDurableObject } from "cloudflare:test";
import { sha256Hex } from "../src/security";
import { validateLogo } from "../src/logo";
import { LOGO_MAX_BYTES } from "../src/logo-policy";

const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
const origin = "https://scheduler.example";

describe("logo upload", () => {
  it("validates image format, completeness, dimensions and actual size", () => {
    expect(validateLogo(png, "image/png")).toEqual({ width: 1, height: 1 });
    expect(() => validateLogo(png, "image/svg+xml")).toThrow("invalid_logo");
    expect(() =>
      validateLogo(
        new TextEncoder().encode("<script>alert(1)</script>"),
        "image/png",
      ),
    ).toThrow("invalid_logo");
    expect(() => validateLogo(png.slice(0, 24), "image/png")).toThrow(
      "invalid_logo",
    );
    const hugeDimensions = png.slice();
    new DataView(hugeDimensions.buffer).setUint32(16, 4096);
    expect(() => validateLogo(hugeDimensions, "image/png")).toThrow(
      "logo_dimensions",
    );
    expect(() =>
      validateLogo(new Uint8Array(LOGO_MAX_BYTES + 1), "image/png"),
    ).toThrow("logo_too_large");
  });
  it("requires same-origin authentication and publishes only after a settings save", async () => {
    const stub = env.SCHEDULER.getByName("alonso");
    const token = "fixture-logo-session";
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO tokens(hash,purpose,expires,value) VALUES(?,?,?,?)",
        await sha256Hex(token),
        "session",
        Date.now() + 60_000,
        "",
      );
    });
    const upload = (
      body: Uint8Array,
      signedIn = true,
      source = origin,
      extraHeaders = {},
    ) =>
      SELF.fetch(origin + "/api/admin/logo", {
        method: "POST",
        body,
        headers: {
          "Content-Type": "image/png",
          Origin: source,
          ...(signedIn ? { Cookie: `scheduler_session=${token}` } : {}),
          ...extraHeaders,
        },
      });
    expect((await upload(png, false)).status).toBe(401);
    expect((await upload(png, true, "https://another.example")).status).toBe(
      403,
    );
    expect((await upload(new Uint8Array(LOGO_MAX_BYTES + 1))).status).toBe(413);
    expect(
      (await upload(png, true, origin, { "Content-Type": "image/svg+xml" }))
        .status,
    ).toBe(400);
    const response = await upload(png);
    expect(response.status).toBe(200);
    const result = (await response.json()) as { url: string };
    expect((await SELF.fetch(result.url)).status).toBe(404);
    let config = await stub.getSettings();
    expect(config.settings.brand.logoUrl).toBe("");
    config.settings.brand.logoUrl = result.url;
    config = await stub.updateSettings(config.settings, config.revision);
    const published = await SELF.fetch(result.url);
    expect(published.status).toBe(200);
    expect(published.headers.get("content-type")).toBe("image/png");
    expect(published.headers.get("x-content-type-options")).toBe("nosniff");
    expect(published.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await published.arrayBuffer())).toEqual(png);
    expect((await upload(png)).status).toBe(200);
    await expect(
      Promise.resolve(
        stub.updateSettings(
          {
            ...config.settings,
            brand: {
              ...config.settings.brand,
              logoUrl: origin + "/api/logo/" + "f".repeat(64),
            },
          },
          config.revision,
        ),
      ),
    ).rejects.toMatchObject({ code: "logo_missing" });
    config.settings.brand.logoUrl = "";
    await stub.updateSettings(config.settings, config.revision);
    expect((await SELF.fetch(result.url)).status).toBe(404);
  });
  it("bounds abandoned uploads without deleting the active logo", async () => {
    const stub = env.SCHEDULER.getByName(crypto.randomUUID());
    const published = await stub.uploadLogo(png, "image/png");
    const config = await stub.getSettings();
    config.settings.brand.logoUrl = published.url;
    await stub.updateSettings(config.settings, config.revision);
    for (let i = 2; i < 16; i++) {
      const next = png.slice();
      new DataView(next.buffer).setUint32(16, i);
      await stub.uploadLogo(next, "image/png");
    }
    const count = await runInDurableObject(
      stub,
      (_instance, state) =>
        state.storage.sql
          .exec<{ n: number }>("SELECT count(*) AS n FROM logos")
          .one().n,
    );
    expect(count).toBe(11);
    expect((await stub.getLogo(published.url.split("/").pop()!)).status).toBe(
      200,
    );
  });
});
