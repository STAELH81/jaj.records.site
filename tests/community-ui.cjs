const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const { communityFixture } = await import("./community-fixture.mjs");
  const f = communityFixture();
  for (const user of Object.values(f.users)) {
    f.identity.user = user;
    await f.call("/api/aq-mail", { action: "join" });
  }
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      }),
      errors = [];
    let active = f.users.alice,
      fail = false;
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.route("**/api/aq-auth", (r) =>
      r.fulfill({ json: { authenticated: false, user: null } }),
    );
    await page.route("**/api/catalog", (r) =>
      r.fulfill({ json: { artists: [], releases: [] } }),
    );
    await page.route("**/api/myspace**", (r) =>
      r.fulfill({ json: { posts: [] } }),
    );
    for (const pattern of ["**/api/aq-mail**", "**/api/forums**"])
      await page.route(pattern, async (route) => {
        const r = route.request(),
          url = new URL(r.url());
        if (fail && r.method() === "POST")
          return route.fulfill({
            status: 503,
            json: { error: "service_unavailable" },
          });
        f.identity.user = active;
        const response = await f.handler(
          new Request(`https://site.test${url.pathname}${url.search}`, {
            method: r.method(),
            headers: {
              "content-type": "application/json",
              origin: "https://site.test",
            },
            ...(r.postData() ? { body: r.postData() } : {}),
          }),
          {},
        );
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      });
    await page.addInitScript(() => {
      localStorage.setItem(
        "aquerty_settings_v1",
        JSON.stringify({
          bootEnabled: false,
          systemPopups: false,
          crtEnabled: false,
        }),
      );
    });
    const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
    async function enter(name) {
      active = name ? f.users[name] : null;
      await page.evaluate((u) => {
        window.JAJSession = u
          ? { ...u, type: "user", displayName: u.user_metadata.display_name }
          : { type: "guest", roles: [] };
        window.dispatchEvent(
          new CustomEvent("jaj:session-changed", { detail: window.JAJSession }),
        );
      }, active);
      if (active)
        await page.waitForFunction(
          () =>
            document.querySelector("#mail-root [role=status]")?.textContent ===
            "",
        );
    }
    await page.goto(base);
    await page.locator("#aq-guest-btn").click();
    await page.waitForFunction(
      () => !document.body.classList.contains("aq-session-pending"),
    );
    await enter("alice");
    await page.evaluate(() => openWindow("win-mail", "task-mail"));
    await page.locator("[data-action=compose]").click();
    await page.locator("#mail-to").selectOption("bob");
    await page
      .locator("#mail-subject")
      .fill("Message privé <img src=x onerror=window.bad=true>");
    await page
      .locator("#mail-body")
      .fill("Salut Bob ! <script>window.bad=true</script>");
    await page.locator("[data-action=close-editor]").click();
    await enter("bob");
    await page.locator("[data-action=compose]").click();
    assert.equal(await page.locator("#mail-subject").inputValue(), "");
    await page.locator("[data-action=close-editor]").click();
    await enter("alice");
    await page.locator("[data-action=compose]").click();
    assert.match(
      await page.locator("#mail-subject").inputValue(),
      /Message privé/,
    );
    fail = true;
    await page.locator("#mail-send").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#mail-editor-status")
        .textContent.includes("indisponible"),
    );
    assert.match(await page.locator("#mail-body").inputValue(), /Salut Bob/);
    fail = false;
    await page.locator("#mail-send").click();
    await page.locator("#mail-editor").waitFor({ state: "hidden" });
    await page.locator("[data-message]").waitFor();
    await enter("bob");
    await page.locator("[data-message]").click();
    assert.match(await page.locator("#mail-view").innerText(), /Salut Bob/);
    assert.equal(await page.evaluate(() => window.bad), undefined);
    await page.locator("[data-action=reply]").click();
    await page.locator("#mail-body").fill("Réponse de Bob");
    await page.locator("#mail-send").click();
    await page.locator("#mail-editor").waitFor({ state: "hidden" });
    await enter("alice");
    await page.locator("[data-message]").click();
    assert.match(
      await page.locator("#mail-view").innerText(),
      /Réponse de Bob/,
    );
    await page.locator("[data-action=trash]").click();
    await page.locator("[data-folder=trash]").click();
    await page.locator("[data-message]").click();
    await page.locator("[data-action=restore]").click();
    // A saved draft survives a full reload, with no mailbox content exposed to guests.
    await page.locator("[data-action=compose]").click();
    await page.locator("#mail-subject").fill("Brouillon durable");
    await page.locator("#mail-body").fill("À finir");
    await page.reload();
    await page.locator("#aq-guest-btn").click();
    await page.waitForFunction(
      () => !document.body.classList.contains("aq-session-pending"),
    );
    await enter("alice");
    await page.evaluate(() => openWindow("win-mail", "task-mail"));
    await page.locator("[data-action=compose]").click();
    assert.equal(
      await page.locator("#mail-subject").inputValue(),
      "Brouillon durable",
    );
    await page.locator("[data-action=close-editor]").click();
    await page.evaluate(() => openWindow("win-myspace", "task-myspace"));
    await page.locator("[data-tab=forums]").click();
    await page.locator("[data-category=sport]").click();
    await page.locator(".forum-compose summary").click();
    await page
      .locator("#forum-create [name=title]")
      .fill("Football du dimanche <b>");
    await page
      .locator("#forum-create [name=text]")
      .fill("Votre équipe préférée ?");
    await page.locator("#forum-create button").click();
    await page.getByText("En attente de validation", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-topic]").count(), 0);
    await enter(null);
    await page.locator(".forum-categories").waitFor();
    assert.equal(await page.locator("#forum-create").count(), 0);
    await enter("admin");
    await page.locator("[data-decision=approve]").click();
    await page.locator("#forum-reply").waitFor();
    await enter("alice");
    await page.locator("[data-topic]").click();
    await page.locator("#forum-reply").waitFor();
    await page.locator("#forum-reply textarea").fill("Première réponse");
    fail = true;
    await page.locator("#forum-reply button").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#forum-reply [role=alert]")
        .textContent.includes("indisponible"),
    );
    assert.equal(
      await page.locator("#forum-reply textarea").inputValue(),
      "Première réponse",
    );
    fail = false;
    await page.locator("#forum-reply button").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".forum-post").length === 2,
    );
    await page.locator("[data-forum=wide]").click();
    assert.equal(
      await page
        .locator("#win-myspace")
        .evaluate((el) => el.classList.contains("forum-wide")),
      true,
    );
    const shots = path.resolve("../community-checks");
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, "forums-desktop.png") });
    await enter("admin");
    await page.locator("[data-topic]").click();
    await page.locator("[data-forum=lock]").click();
    await page.locator("[data-forum=unlock]").waitFor();
    assert.equal(await page.locator("#forum-reply").count(), 0);
    await enter(null);
    await page.locator("[data-topic]").click();
    assert.equal(await page.locator("#forum-reply").count(), 0);
    await enter("bob");
    await page.locator("[data-topic]").click();
    await page.evaluate(() => updateSetting("desktopLanguage", "en"));
    await page.locator("[data-topic]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#forum-body")
        .textContent.includes("Topic locked"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(shots, "forums-mobile.png") });
    assert.equal(
      await page
        .locator("#win-myspace")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
      true,
    );
    await page.evaluate(() => openWindow("win-mail", "task-mail"));
    await page.locator("[data-message]").first().click();
    assert.match(await page.locator("#mail-view").innerText(), /Salut Bob/);
    await page.screenshot({ path: path.join(shots, "mail-mobile.png") });
    assert.equal(
      await page
        .locator("#mail-root")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
      true,
    );
    await page.locator("[data-folder=members]").click();
    await page.locator("[data-action=block][data-target=alice]").click();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-action=block][data-target=alice]")
          ?.textContent === "Unblock",
    );
    await page.locator("[data-action=block][data-target=alice]").click();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-action=block][data-target=alice]")
          ?.textContent === "Block",
    );
    await page.evaluate(() => {
      openWindow("win-ie", "task-ie");
      setIEPage("release:cha-dual-2026");
    });
    await page.locator("[data-share-kind=release]").click();
    await page
      .getByRole("button", { name: "Share via AQ-Mail", exact: true })
      .click();
    await page.locator("#mail-editor").waitFor();
    assert.match(
      await page.locator("#mail-body").inputValue(),
      /release=cha-dual-2026/,
    );
    await page.locator("[data-action=close-editor]").click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("[data-folder=inbox]").click();
    await page.locator("[data-message]").first().click();
    await page.screenshot({ path: path.join(shots, "mail-desktop.png") });
    assert.equal(
      await page
        .locator("#mail-root .mail-sidebar")
        .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
      180,
    );
    assert.equal(
      await page.locator(".mail-toolbar [data-action=reply]").count(),
      1,
    );
    assert.equal(
      await page.locator("#mail-root .mail-account-strip").count(),
      1,
    );
    await enter(null);
    assert.equal(await page.locator("[data-message]").count(), 0);
    assert.equal(await page.locator("#mail-editor").isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: private send/reply, account isolation, persistent local draft, failure recovery, safe text, restore, forum creation/reply/moderation, guests, FR/EN, wide and mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
