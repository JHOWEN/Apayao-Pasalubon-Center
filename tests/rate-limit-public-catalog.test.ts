import test from "node:test";
import assert from "node:assert/strict";

import { buildRateLimitKeys, enforceRateLimit } from "../src/lib/rate-limit";

test("public storefront read routes ignore client IP so catalog requests are not blocked behind shared proxy traffic", () => {
  const request = new Request("https://example.com/api/public/products", {
    headers: {
      "x-forwarded-for": "203.0.113.10, 10.0.0.5",
      "x-real-ip": "198.51.100.42",
    },
  });

  assert.deepEqual(buildRateLimitKeys(request, "public:products"), ["public:products"]);
  assert.deepEqual(buildRateLimitKeys(request, "public:categories"), ["public:categories"]);
});

test("localhost storefront requests bypass rate limiting during development", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousEnv = env.NODE_ENV;
  env.NODE_ENV = "development";

  try {
    const request = new Request("http://localhost:3000/api/public/products");

    for (let i = 0; i < 10; i += 1) {
      const response = await enforceRateLimit(request, "public:products", {
        maxAttempts: 5,
        windowMs: 60 * 1000,
      });
      assert.equal(response, null);
    }
  } finally {
    env.NODE_ENV = previousEnv;
  }
});
