import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

// Shared geometry checks inspect rendered controls and text, including overflow
// clipped by an ancestor. The existing quality suite owns the broad axe scans.
export async function responsiveLayoutIssues(page, scope = "#main") {
  return page.locator(scope).evaluate((root) => {
    const issues = [];
    const describe = (el) => {
      if (el.id) return `#${el.id}`;
      const data = [...el.attributes].find((a) => a.name.startsWith("data-"));
      return data
        ? `[${data.name}${data.value ? `="${data.value}"` : ""}]`
        : `${el.tagName.toLowerCase()}${el.classList.length ? "." + [...el.classList].join(".") : ""}`;
    };
    const visible = (el) =>
      el.getClientRects().length &&
      getComputedStyle(el).visibility !== "hidden";
    if (document.documentElement.scrollWidth > innerWidth + 1)
      issues.push({ selector: "html", issue: "Page overflows horizontally" });
    const controls = [
      ...root.querySelectorAll(
        'button, a.button, select, textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])',
      ),
    ].filter(visible);
    for (const el of controls) {
      const box = el.getBoundingClientRect();
      if (box.left < -1 || box.right > innerWidth + 1)
        issues.push({
          selector: describe(el),
          issue: "Control leaves viewport",
          left: box.left,
          right: box.right,
        });
      if (!el.disabled && box.height < 43.5)
        issues.push({
          selector: describe(el),
          issue: "Control below 44px height",
          height: box.height,
        });
      for (const other of controls) {
        if (
          controls.indexOf(other) <= controls.indexOf(el) ||
          el.contains(other) ||
          other.contains(el)
        )
          continue;
        const b = other.getBoundingClientRect();
        if (
          Math.min(box.right, b.right) - Math.max(box.left, b.left) > 1 &&
          Math.min(box.bottom, b.bottom) - Math.max(box.top, b.top) > 1
        )
          issues.push({
            selector: describe(el),
            issue: "Controls overlap",
            other: describe(other),
          });
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode,
        el = text.parentElement;
      if (
        !text.textContent.trim() ||
        !visible(el) ||
        el.closest(".sr-only, select, textarea, script, style")
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const box of range.getClientRects()) {
        if (box.width && (box.left < -1 || box.right > innerWidth + 1)) {
          issues.push({
            selector: describe(el),
            issue: "Text leaves viewport",
            text: text.textContent.trim().slice(0, 90),
            right: box.right,
          });
          break;
        }
      }
    }
    return issues;
  });
}

export async function checkResponsivePublic(
  browser,
  base,
  apiFixture,
  settings,
  bookingPath,
) {
  const context = await browser.newContext({
    timezoneId: "America/Denver",
    reducedMotion: "reduce",
  });
  await context.route("**/api/**", apiFixture);
  const page = await context.newPage();
  const errors = [],
    checks = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const config = structuredClone(settings);
  config.enabled = true;
  config.spanishEnabled = true;
  const inPerson = config.types.find((type) => type.mode === "in-person");
  inPerson.enabled = true;
  inPerson.locationIds = ["responsive-studio"];
  config.locations = [
    {
      id: "responsive-studio",
      enabled: true,
      name: {
        en: "The studio and project workshop",
        es: "El estudio y taller de proyectos",
      },
      address: {
        en: "123 Example Avenue Northwest, Albuquerque, NM 87102",
        es: "123 Example Avenue Northwest, Albuquerque, NM 87102",
      },
      hours: config.hours,
    },
  ];
  const booking = {
    id: "responsive-booking",
    typeId: inPerson.id,
    typeName: "A conversation at the studio",
    mode: "in-person",
    locationId: "responsive-studio",
    location:
      "The studio and project workshop · 123 Example Avenue Northwest, Albuquerque, NM 87102",
    locationInstructions:
      "Use the entrance on the west side. The workshop is on the second floor.",
    start: Date.parse("2026-09-14T18:00:00Z"),
    end: Date.parse("2026-09-14T19:00:00Z"),
    status: "confirmed",
    locale: "en",
    timezone: "America/Denver",
    email: "a.long.but.valid.guest.email.address@example.test",
    name: "Responsive Test Guest",
    cancelUntil: Date.parse("2026-09-13T18:00:00Z"),
  };
  const json = (route, payload) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  await page.route("**/api/config", (route) =>
    json(route, {
      settings: config,
      ready: true,
      turnstileSiteKey: "fixture-key",
    }),
  );
  await page.route("**/api/bookings/responsive-booking", (route) =>
    json(route, { booking }),
  );
  await page.route("**/api/admin/session", (route) =>
    json(route, { authenticated: false }),
  );
  await page.route("**/api/availability?*", (route) => {
    const from = Date.parse(
      new URL(route.request().url()).searchParams.get("from"),
    );
    return json(route, {
      slots: Array.from({ length: 12 }, (_, index) =>
        new Date(from + 5 * 86400000 + (9 + index / 2) * 3600000).toISOString(),
      ),
    });
  });
  // Match the selected widget's real dimensions without contacting Cloudflare.
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = { render(el, options) {
      const widget = document.createElement('div');
      widget.setAttribute('data-fixture-verification', options.size);
      widget.style.cssText = 'box-sizing:border-box;border:1px solid currentColor;border-radius:4px;display:grid;place-items:center;font:12px system-ui;';
      widget.style.width = options.size === 'compact' ? '150px' : '100%';
      widget.style.minWidth = options.size === 'compact' ? '150px' : '300px';
      widget.style.height = options.size === 'compact' ? '140px' : '65px';
      widget.textContent = 'Verification fixture'; el.append(widget);
      queueMicrotask(() => options.callback('fixture-turnstile')); return 'widget';
    }, reset(){}, remove(){document.querySelector('[data-fixture-verification]')?.remove()} };`,
    }),
  );
  // This review only reads state. Catch accidental submissions before fallback.
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    errors.push(
      "Responsive review attempted a write: " +
        new URL(route.request().url()).pathname,
    );
    return route.abort();
  });
  await page.clock.setFixedTime(new Date("2026-09-09T18:00:00Z"));
  let current;
  const review = async (step, scope = "#main", screenshot = false) => {
    await page.evaluate(() => document.fonts.ready);
    const issues = await responsiveLayoutIssues(page, scope);
    const result = { ...current, step, issues };
    if (screenshot || issues.length) {
      result.screenshot = `work/frontend/responsive-${current.locale}-${current.width}-${current.theme}-${step}.png`;
      await page.screenshot({
        path: result.screenshot,
        fullPage: scope !== "dialog",
      });
    }
    checks.push(result);
  };
  const reviewZoomed = async (step) => {
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    await review(step + "-200-percent", "#main", true);
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        })
      ).violations.map((violation) => ({
        issue: violation.id,
        selectors: violation.nodes.map((node) => node.target),
      })),
    );
    checks.at(-1).issues.push(...violations);
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  };
  try {
    for (const locale of ["en", "es"]) {
      for (const width of [320, 390, 768, 1024]) {
        const theme =
          (width === 390 || width === 768) !== (locale === "es")
            ? "dark"
            : "light";
        current = { locale, width, theme };
        const prefix = locale === "es" ? "/es" : "";
        const capture =
          (locale === "en" && (width === 320 || width === 768)) ||
          (locale === "es" && (width === 390 || width === 1024));
        await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(base + prefix + bookingPath);
        await page.locator(`[data-type="${inPerson.id}"]`).waitFor();
        await review("meeting-choice");
        await page.locator(`[data-type="${inPerson.id}"]`).press("Enter");
        await page.locator("[data-location]").waitFor();
        await review("location", "#main", capture);
        await page.locator("[data-location]").focus();
        await page.locator("[data-location]").selectOption("responsive-studio");
        await page.locator("[data-slot]").first().waitFor();
        const addressGap = await page
          .locator("[data-address]")
          .evaluate((el) => {
            const select = document.querySelector("[data-location]");
            const range = document.createRange();
            range.selectNodeContents(el);
            return (
              range.getBoundingClientRect().top -
              select.getBoundingClientRect().bottom
            );
          });
        await review("times", "#main", capture);
        checks.at(-1).locationAddressTextGap = addressGap;
        const focusExtent = await page
          .locator("[data-location]")
          .evaluate((el) => {
            const css = getComputedStyle(el);
            return parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset);
          });
        checks.at(-1).locationAddressFocusGap = addressGap - focusExtent;
        if (addressGap - focusExtent < 3.5)
          checks.at(-1).issues.push({
            selector: "[data-address]",
            issue: "Address crowds the location focus outline",
            gap: addressGap - focusExtent,
          });
        await page.locator("[data-slot]").first().press("Enter");
        await page.locator("[data-details]").waitFor();
        await page.locator("[data-submit]:enabled").waitFor();
        assert.equal(
          await page
            .locator(".booking-panel h2")
            .evaluate((el) => el === document.activeElement),
          true,
          `${locale}/${width}: details heading receives keyboard focus`,
        );
        await page.locator('[name="name"]').fill("Responsive Test Guest");
        await page.locator('[name="email"]').fill(booking.email);
        await page
          .locator('[name="topic"]')
          .fill("I would like to discuss a project at the studio.");
        await review("details", "#main", capture);
        if (width === 320) await reviewZoomed("details");
        await page.locator("[data-submit]").focus();
        assert.equal(
          await page.locator("[data-submit]").evaluate((el) => {
            const box = el.getBoundingClientRect();
            return (
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              el.contains(
                document.elementFromPoint(
                  box.left + box.width / 2,
                  box.top + box.height / 2,
                ),
              )
            );
          }),
          true,
          `${locale}/${width}: focused booking action is visible and unobscured`,
        );
        await page.goto(
          base +
            prefix +
            "/manage/#id=responsive-booking&token=fixture-private-token",
        );
        await page.locator("[data-reschedule]").waitFor();
        await review("manage", "#main", capture);
        await page.locator("[data-cancel]").press("Enter");
        await page.locator("dialog[open]").waitFor();
        await review("cancel-dialog", "dialog", capture);
        assert.equal(
          await page
            .locator('dialog button[value="cancel"]')
            .evaluate((el) => el === document.activeElement),
          true,
          `${locale}/${width}: safe dialog action receives focus`,
        );
        await page.keyboard.press("Escape");
        await page.locator("dialog").waitFor({ state: "detached" });
        assert.equal(
          await page
            .locator("[data-cancel]")
            .evaluate((el) => el === document.activeElement),
          true,
          `${locale}/${width}: closing dialog returns focus`,
        );
        await page.locator("[data-reschedule]").press("Enter");
        await page.locator("[data-slot]").first().waitFor();
        await review("reschedule", "#main", capture);
        await page.locator("[data-slot]").first().press("Enter");
        await page.locator("dialog[open]").waitFor();
        await review("reschedule-dialog", "dialog", capture);
        await page.keyboard.press("Escape");
        await page.goto(base + prefix + "/privacy/");
        await page.locator("h1").waitFor();
        await review("privacy");
        await page.goto(base + prefix + "/admin/");
        await page.locator("[data-login-button]:enabled").waitFor();
        await page.locator('[name="email"]').fill("owner@example.test");
        await review("sign-in", "#main", capture);
        if (width === 320) await reviewZoomed("sign-in");
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await writeFile(
      "work/frontend/responsive-public-review.json",
      JSON.stringify(checks, null, 2) + "\n",
    );
    await context.close();
  }
  const failures = checks.filter((check) => check.issues.length);
  assert.deepEqual(
    failures,
    [],
    `Responsive public layout findings: ${JSON.stringify(failures, null, 2)}`,
  );
  console.log(
    `Responsive public passed: ${checks.length} locale/viewport/step checks, sized verification fixtures and keyboard dialogs.`,
  );
}
