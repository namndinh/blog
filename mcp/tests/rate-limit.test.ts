import { describe, expect, it } from "vitest";
import { BlogError } from "../src/errors.js";
import { checkRateLimit, resetRateLimits } from "../src/rate-limit.js";

describe("rate limit", () => {
  it("allows traffic under the cap and then blocks", () => {
    resetRateLimits();
    const now = 1_000_000;
    checkRateLimit("ip:1", 2, 60_000, now);
    checkRateLimit("ip:1", 2, 60_000, now + 10);
    try {
      checkRateLimit("ip:1", 2, 60_000, now + 20);
    } catch (error) {
      expect((error as BlogError).code).toBe("rate_limited");
      expect((error as BlogError).retryable).toBe(true);
    }
  });
});
