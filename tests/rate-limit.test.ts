import assert from "node:assert/strict";
import test from "node:test";
import { formatRateLimitRetryDelay } from "../src/lib/rate-limit";

test("formats a short retry delay in seconds", () => {
  assert.equal(formatRateLimitRetryDelay(30), "30 seconds");
});

test("formats minute retries without a malformed clock-like string", () => {
  assert.equal(formatRateLimitRetryDelay(90), "1 minute");
  assert.equal(formatRateLimitRetryDelay(150), "2 minutes");
});

test("formats long retries with hours and minutes", () => {
  assert.equal(formatRateLimitRetryDelay(3661), "1 hour and 1 minute");
});
