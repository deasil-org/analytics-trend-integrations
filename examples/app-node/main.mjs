// Sending events to AnalyticsTrend from a Node server, over HTTP, with no SDK.
// The same request works from anything that can POST JSON.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WRITE_KEY = process.env.ANALYTICSTREND_WRITE_KEY;
const ENDPOINT = process.env.ANALYTICSTREND_ENDPOINT ?? "https://analyticstrend.com/v1/collect";
if (!WRITE_KEY) {
  console.error("Set ANALYTICSTREND_WRITE_KEY to your project's write key.");
  process.exit(1);
}

// One random id per user, made once and kept. A server sending on a user's
// behalf would use the id that user's app keeps; this example keeps its own.
// Never an email address, an account id or a device identifier.
const ID_FILE = fileURLToPath(new URL(".analyticstrend-id", import.meta.url));
function anonymousId() {
  if (existsSync(ID_FILE)) return readFileSync(ID_FILE, "utf8").trim();
  const id = randomUUID();
  writeFileSync(ID_FILE, id);
  return id;
}

// Each event gets its own id when it happens, so a retry sends the same ids
// and the collector keeps one of each.
const event = (name, props) => ({ id: randomUUID(), name, ts: new Date().toISOString(), ...(props ? { props } : {}) });

const batch = {
  writeKey: WRITE_KEY,
  client: "app",
  clientVersion: "example-node-1.0.0",
  appVersion: "1.0.0",
  anonymousId: anonymousId(),
  // A server's own address is not the user's: no country or region from it.
  location: false,
  events: [event("app_opened"), event("report_exported", { format: "csv" })],
};

// A network error or a 5xx is worth retrying, with the same body. A 4xx says
// what is wrong with the request; sending it again would not help.
async function send(body) {
  const delays = [500, 1000, 2000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (response.status < 500 || attempt === delays.length) return response;
    } catch (error) {
      if (attempt === delays.length) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
  }
}

const response = await send(batch);
console.log(response.status, await response.text());
