import type { IncomingEvent } from "@analyticstrend/event-schema";
import { ANONYMOUS_ID_STORAGE_KEY, type StorageAdapter } from "@analyticstrend/sdk-core";
import type { BrowserApi } from "./browser.ts";

const QUEUE_KEY = "analyticstrend.queue";
const ANON_KEY = ANONYMOUS_ID_STORAGE_KEY;

// Every read and write goes to storage.local rather than memory: MV3 service
// workers are suspended after ~30s idle and Firefox event pages unload on the
// same principle, so an in-memory queue is lost with no warning.
export function createExtensionStorage(api: BrowserApi): StorageAdapter {
  return {
    async read() {
      const stored = await api.storage.local.get(QUEUE_KEY);
      const queue = stored[QUEUE_KEY];
      return Array.isArray(queue) ? (queue as IncomingEvent[]) : [];
    },
    async write(events) {
      await api.storage.local.set({ [QUEUE_KEY]: events });
    },
  };
}

// Removes what the SDK stored: the identifier and the queue. Used only when a
// customer asks for it on Global Privacy Control; nothing requires it.
export async function clearStoredData(api: BrowserApi): Promise<void> {
  await api.storage.local.remove?.([ANON_KEY, QUEUE_KEY]);
}

// Check-then-act: a read of ANON_KEY followed by a conditional write, with no
// atomicity between them. Harmless on the only path this SDK exercises today
// — initBackground calls this once per background context, and a browser
// runs at most one live background context at a time — but an integrator
// calling this exported function directly and concurrently (e.g. once from
// initBackground and again from a popup script racing it on first install)
// could have both calls read "no id yet" and each generate and persist their
// own UUID, with whichever write lands last winning. The cost is identity
// fragmentation for that call's lifetime (events briefly attributed to two
// anonymous ids), not data loss — no events are dropped either way.
export async function getOrCreateAnonymousId(api: BrowserApi): Promise<string> {
  const stored = await api.storage.local.get(ANON_KEY);
  const existing = stored[ANON_KEY];
  if (typeof existing === "string" && existing.length > 0) return existing;

  const generated = crypto.randomUUID();
  await api.storage.local.set({ [ANON_KEY]: generated });
  return generated;
}
