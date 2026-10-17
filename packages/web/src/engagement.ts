import { LIMITS } from "@analyticstrend/event-schema";

// How long a page was visible (visits spec §2): counted only while the page
// is visible, reported when it is hidden and when a single-page app moves to
// another path. Under a second waits for the next signal; one signal says at
// most 30 minutes, so a tab left open overnight cannot inflate a visit.

export type EngagementSignal = { $engaged_ms: number; $path: string };

export function createEngagement(options: {
  now: () => number;
  visible: boolean;
  path: string;
  send: (props: EngagementSignal) => void;
}): { hidden(): void; shown(): void; moved(path: string): void } {
  let since: number | null = options.visible ? options.now() : null;
  let carried = 0;
  let path = options.path;

  const settle = () => {
    if (since === null) return;
    const now = options.now();
    carried += Math.max(0, now - since);
    since = now;
  };
  const report = () => {
    if (carried < LIMITS.MIN_ENGAGED_MS) return;
    options.send({ $engaged_ms: Math.min(Math.round(carried), LIMITS.MAX_ENGAGED_MS), $path: path });
    carried = 0;
  };

  return {
    hidden() {
      settle();
      since = null;
      report();
    },
    shown() {
      if (since === null) since = options.now();
    },
    moved(next) {
      if (next === path) return;
      settle();
      report();
      path = next;
    },
  };
}
