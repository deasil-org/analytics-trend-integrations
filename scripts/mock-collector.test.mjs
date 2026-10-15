import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startMockCollector } from "./mock-collector.mjs";

// The mock answers as the collector does, checking each batch with the same
// rules from @analyticstrend/event-schema, so an example that passes against
// it sends what the real collector accepts.

let mock;
before(async () => {
  mock = await startMockCollector({ port: 0 });
});
after(() => mock.close());

const batch = (overrides = {}) => ({
  writeKey: "wk_example",
  client: "app",
  clientVersion: "example-test-1.0.0",
  appVersion: "1.0.0",
  anonymousId: "5f0c6c0e-7f7e-4a51-9d0b-1f9f3c1b2a77",
  events: [{ id: "e1", name: "app_opened", ts: new Date().toISOString() }],
  ...overrides,
});

const post = (body, path = "/v1/collect") =>
  fetch(`${mock.url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("accepts a valid batch, answering as the collector does, and keeps it", async () => {
  const response = await post(batch());
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: 1, rejectedNames: [], invalidEvents: [] });
  assert.equal(mock.received.length, 1);
  assert.equal(mock.received[0].client, "app");
});

test("refuses a batch the collector would refuse, and keeps nothing", async () => {
  const before = mock.received.length;
  const response = await post(batch({ client: "mobile" }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /client must be/);
  assert.equal(mock.received.length, before);
});

test("answers any other address with 404", async () => {
  assert.equal((await post(batch(), "/elsewhere")).status, 404);
});
