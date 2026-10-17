import { describe, expect, it } from "vitest";
import { createEngagement } from "./engagement.ts";

// How long a page was visible (visits spec §2), with the clock in the test's
// hands: counted only while visible, reported on hide and on a path change.

function harness(visible = true, path = "/") {
  let clock = 0;
  const sent: { $engaged_ms: number; $path: string }[] = [];
  const engagement = createEngagement({ now: () => clock, visible, path, send: (props) => sent.push(props) });
  return { engagement, sent, advance: (ms: number) => void (clock += ms) };
}

describe("createEngagement", () => {
  it("reports the visible time when the page is hidden", () => {
    const { engagement, sent, advance } = harness();
    advance(12_500);
    engagement.hidden();
    expect(sent).toEqual([{ $engaged_ms: 12_500, $path: "/" }]);
  });

  it("counts nothing while hidden, and starts again when shown", () => {
    const { engagement, sent, advance } = harness();
    advance(3_000);
    engagement.hidden();
    advance(60_000);
    engagement.shown();
    advance(4_000);
    engagement.hidden();
    expect(sent.map((signal) => signal.$engaged_ms)).toEqual([3_000, 4_000]);
  });

  it("starts counting only once shown when the page loads hidden", () => {
    const { engagement, sent, advance } = harness(false);
    advance(30_000);
    engagement.hidden();
    expect(sent).toEqual([]);
    engagement.shown();
    advance(2_000);
    engagement.hidden();
    expect(sent).toEqual([{ $engaged_ms: 2_000, $path: "/" }]);
  });

  it("carries under a second over to the next signal", () => {
    const { engagement, sent, advance } = harness();
    advance(600);
    engagement.hidden();
    expect(sent).toEqual([]);
    engagement.shown();
    advance(700);
    engagement.hidden();
    expect(sent).toEqual([{ $engaged_ms: 1_300, $path: "/" }]);
  });

  it("sends at most 30 minutes in one signal", () => {
    const { engagement, sent, advance } = harness();
    advance(5 * 60 * 60_000);
    engagement.hidden();
    expect(sent).toEqual([{ $engaged_ms: 1_800_000, $path: "/" }]);
  });

  it("reports the page being left when the path changes, and counts on for the new one", () => {
    const { engagement, sent, advance } = harness(true, "/a");
    advance(5_000);
    engagement.moved("/b");
    advance(8_000);
    engagement.hidden();
    expect(sent).toEqual([
      { $engaged_ms: 5_000, $path: "/a" },
      { $engaged_ms: 8_000, $path: "/b" },
    ]);
  });

  it("sends nothing twice when pagehide follows visibilitychange", () => {
    const { engagement, sent, advance } = harness();
    advance(5_000);
    engagement.hidden();
    engagement.hidden();
    expect(sent).toHaveLength(1);
  });
});
