// Loads the built example into real Chromium and real Firefox and checks, from
// the receiving end, that events actually arrive.
//
// The SDK's unit tests simulate both lifecycles. This is the check they cannot
// be: a real service worker, a real event page, real extension storage, real
// CORS. The collector is a stub that records batches, so what is asserted is
// exactly what each browser put on the wire.
//
//   pnpm --filter example-plain check:browsers
//   pnpm --filter example-plain check:browsers chrome
//   pnpm --filter example-plain check:browsers firefox
//
// CHROMIUM_PATH and FIREFOX_PATH override the browser binaries. Branded Google
// Chrome ignores --load-extension from version 137, so the default is the
// Chromium that Playwright installs (`npx playwright install chromium`).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const only = process.argv[2];

// Chrome suspends an idle extension service worker after about 30 seconds, and
// Firefox unloads an idle event page on a similar clock. The test page reloads
// after this long, so its second page_visited has to wake a background that was
// asleep — the path on which a listener registered too late loses the event.
const RELOAD_AFTER_MS = 45_000;
const DEADLINE_MS = 150_000;

// The SDK sends a few seconds after a track. This allows for that plus a slow
// machine, and is far short of the 45-second reload: an event that only arrives
// when the next reload wakes the background fails it.
const MAX_LATENCY_MS = 15_000;

// How long to watch for a send that must never come. Comfortably past the
// SDK's five-second delivery delay and the background's first idle suspend.
const SILENCE_WINDOW_MS = 40_000;

const WRITE_KEY = "wk_browser_check";

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const caches = [
    join(homedir(), "AppData", "Local", "ms-playwright"),
    join(homedir(), "Library", "Caches", "ms-playwright"),
    join(homedir(), ".cache", "ms-playwright"),
  ];

  for (const dir of caches) {
    if (!existsSync(dir)) continue;
    const builds = readdirSync(dir)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));

    for (const build of builds) {
      for (const candidate of [
        join(dir, build, "chrome-win64", "chrome.exe"),
        join(dir, build, "chrome-win", "chrome.exe"),
        join(dir, build, "chrome-linux64", "chrome"),
        join(dir, build, "chrome-linux", "chrome"),
        join(dir, build, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      ]) {
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

function findFirefox() {
  if (process.env.FIREFOX_PATH) return process.env.FIREFOX_PATH;

  for (const candidate of [
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    "/Applications/Firefox.app/Contents/MacOS/firefox",
    "/usr/bin/firefox",
  ]) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function startCollector() {
  const batches = [];
  const pageLoads = [];
  const page = `<!doctype html><title>AnalyticsTrend browser check</title>
<p>The example extension's content script runs on this page.</p>
<script>setTimeout(() => location.reload(), ${RELOAD_AFTER_MS});</script>`;

  const server = createServer((request, response) => {
    // The same grant the real collector makes: reflect the origin, allow the
    // JSON content type, no credentials. The origin here is chrome-extension://
    // or moz-extension://, which is exactly what a stub without CORS would hide.
    const origin = request.headers.origin;
    if (origin) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "origin");
    }

    if (request.method === "OPTIONS") {
      response.setHeader("access-control-allow-methods", "POST, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.writeHead(204).end();
      return;
    }

    if (request.method === "POST" && request.url === "/v1/collect") {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        let batch = null;
        try {
          batch = JSON.parse(body);
        } catch {
          // Recorded as null, and the envelope check below fails on it.
        }
        batches.push({ at: Date.now(), origin, batch });
        response.writeHead(202, { "content-type": "application/json" }).end("{}");
      });
      return;
    }

    if (request.url?.startsWith("/page.html")) {
      pageLoads.push(Date.now());
      response.writeHead(200, { "content-type": "text/html" }).end(page);
      return;
    }

    response.writeHead(404).end();
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, batches, pageLoads, port: server.address().port });
    });
  });
}

function eventsIn(batches) {
  return batches.flatMap(({ at, batch }) =>
    (batch?.events ?? []).map((event) => ({ at, name: event.name })),
  );
}

function build(endpoint) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "scripts", "build.mjs")], {
      env: { ...process.env, AT_ENDPOINT: endpoint, AT_WRITE_KEY: WRITE_KEY },
      stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
  });
}

async function waitFor(predicate, deadline) {
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// `mode` is "delivery" for the ordinary case, or "silence" for Firefox with
// data-collection consent withheld, where the correct behaviour is to send
// nothing at all.
async function runBrowser(label, launch, collector, mode = "delivery") {
  collector.batches.length = 0;
  collector.pageLoads.length = 0;
  const start = Date.now();
  const child = launch();

  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));

  const seen = () => eventsIn(collector.batches);
  const visits = () => seen().filter((event) => event.name === "page_visited");

  // Three page loads: at launch, and two reloads RELOAD_AFTER_MS apart. The
  // second and third each land after the background has been idle past its
  // suspend timeout, so each has to wake it.
  const EXPECTED_LOADS = 3;

  if (mode === "silence") {
    // One page load and a generous margin past the send delay. There is no
    // arrival to wait for, so the wait is the evidence.
    await waitFor(() => false, start + SILENCE_WINDOW_MS);
  } else {
    await waitFor(
      () =>
        collector.pageLoads.length >= EXPECTED_LOADS &&
        visits().length >= collector.pageLoads.length &&
        seen().some((event) => event.name === "background_started"),
      start + DEADLINE_MS,
    );
  }

  child.kill();

  const all = seen();
  const delivered = visits();
  const loads = collector.pageLoads;
  const anonymousIds = new Set(collector.batches.map(({ batch }) => batch?.anonymousId));
  const schemes = new Set(collector.batches.map(({ origin }) => origin?.split("://")[0] ?? "none"));
  const firstStart = all.find((event) => event.name === "background_started");

  // Paired in order: the nth page load against the nth delivered visit. A lost
  // visit shows up as a load with no partner, and a slow one as a large gap.
  const latencies = loads.map((loadedAt, index) =>
    delivered[index] ? delivered[index].at - loadedAt : Number.POSITIVE_INFINITY,
  );

  const checks =
    mode === "silence"
      ? [
          ["the extension ran and the page loaded", loads.length >= 1],
          ["nothing was sent, because consent was withheld", all.length === 0],
        ]
      : [
          [
            `the background started and delivered within ${MAX_LATENCY_MS / 1000}s of launch`,
            firstStart !== undefined && firstStart.at - start < MAX_LATENCY_MS,
          ],
          [`the page loaded ${EXPECTED_LOADS} times`, loads.length >= EXPECTED_LOADS],
          [
            "every page load delivered its page_visited: none lost",
            loads.length > 0 && delivered.length >= loads.length,
          ],
          [
            `every page_visited arrived within ${MAX_LATENCY_MS / 1000}s, including after the background went idle`,
            loads.length > 0 && latencies.every((latency) => latency < MAX_LATENCY_MS),
          ],
          ["one anonymous id across every batch", anonymousIds.size === 1],
          [
            "every batch declares the extension client and the write key",
            collector.batches.length > 0 &&
              collector.batches.every(
                ({ batch }) => batch?.client === "extension" && batch?.writeKey === WRITE_KEY,
              ),
          ],
        ];

  console.log(
    `\n${label}: ${loads.length} page load(s), ${all.length} event(s) in ${collector.batches.length} batch(es), origin ${[...schemes].join(", ")}`,
  );
  for (const loadedAt of loads) {
    console.log(`  +${String(Math.round((loadedAt - start) / 1000)).padStart(3)}s  (page loaded)`);
  }
  for (const event of all) {
    console.log(`  +${String(Math.round((event.at - start) / 1000)).padStart(3)}s  ${event.name}`);
  }

  let passed = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) passed = false;
  }

  if (!passed && output.trim()) {
    const tail = output.trim().split("\n").slice(-25);
    console.log(`  browser output, last lines:\n${tail.map((line) => `    ${line}`).join("\n")}`);
  }

  return passed;
}

const collector = await startCollector();
const endpoint = `http://127.0.0.1:${collector.port}`;
const pageUrl = `${endpoint}/page.html`;
await build(endpoint);

const results = [];

if (!only || only === "chrome") {
  const chromium = findChromium();
  if (!chromium) {
    console.log("\nChromium: SKIPPED, none found. Run `npx playwright install chromium` or set CHROMIUM_PATH.");
  } else {
    const profile = mkdtempSync(join(tmpdir(), "at-chromium-"));
    results.push(
      await runBrowser(
        "Chromium",
        () =>
          spawn(
            chromium,
            [
              `--user-data-dir=${profile}`,
              `--disable-extensions-except=${dist}`,
              `--load-extension=${dist}`,
              "--headless=new",
              // Test-only profile, same default as Playwright: the Chromium
              // sandbox needs filesystem ACLs that a Playwright download on
              // Windows often lacks, and without them the network service
              // crashes before the extension can send anything.
              "--no-sandbox",
              "--no-first-run",
              "--no-default-browser-check",
              pageUrl,
            ],
            { stdio: ["ignore", "pipe", "pipe"] },
          ),
        collector,
      ),
    );
    // The browser holds the profile open for a moment after it is killed.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

if (!only || only === "firefox") {
  const firefox = findFirefox();
  if (!firefox) {
    console.log("\nFirefox: SKIPPED, none found. Set FIREFOX_PATH.");
  } else {
    const webExt = join(root, "node_modules", "web-ext", "bin", "web-ext.js");

    const launchFirefox = (prefs = []) =>
      spawn(
        process.execPath,
        [
          webExt,
          "run",
          "--source-dir",
          dist,
          "--target",
          "firefox-desktop",
          `--firefox=${firefox}`,
          `--start-url=${pageUrl}`,
          "--no-reload",
          "--no-input",
          ...prefs,
        ],
        // Headless through the environment rather than --arg=-headless:
        // passed as an argument, web-ext gave up connecting to Firefox's
        // debugger before it was listening.
        { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MOZ_HEADLESS: "1" } },
      );

    // Firefox 140 and later let someone decline analytics, and leave honouring
    // that to the extension. A temporary add-on never goes through the install
    // flow, so it starts with the permission ungranted — which makes this the
    // one browser that can test the refusal for free. Nothing may be sent.
    results.push(
      await runBrowser("Firefox, consent withheld", () => launchFirefox(), collector, "silence"),
    );

    // The same build with the data-collection framework switched off, which is
    // every Firefox before 140 and every Chrome. There is no consent to give,
    // so the ordinary delivery guarantees apply.
    results.push(
      await runBrowser(
        "Firefox, no data-collection prompt",
        () => launchFirefox(["--pref=extensions.dataCollectionPermissions.enabled=false"]),
        collector,
      ),
    );
  }
}

collector.server.close();

if (results.length === 0) {
  console.log("\nNo browsers ran.");
  process.exit(1);
}

process.exit(results.every(Boolean) ? 0 : 1);
