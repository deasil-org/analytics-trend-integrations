import { describe, expect, it } from "vitest";
import { isRetryableStatus } from "./constants.ts";

describe("isRetryableStatus", () => {
  // Both platform transports call this one function now, so the rule is
  // pinned once, here, at its boundaries — rather than twice, indirectly,
  // through two tables of fetch stubs that could drift apart again.
  it.each([
    [200, false],
    [202, false],
    [400, false],
    [401, false],
    [404, false],
    [408, true],
    [429, true],
    [499, false],
    [500, true],
    [503, true],
    [599, true],
  ])("classifies %i as retryable=%s", (status, expected) => {
    expect(isRetryableStatus(status)).toBe(expected);
  });
});
