// Smoke tests for the HerdrClient. These do not require herdr to be running;
// they verify the client surfaces clean errors when the socket is absent
// and the timeout behavior is correct.
//
// Run with: npm test
//
// For a real integration test, start herdr in another shell (`herdr`) and
// run with HERDR_TEST_LIVE=1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { HerdrClient, safeTimeoutMs } from "../src/herdr-client.ts";

test("safeTimeoutMs coerces bad input to the fallback", () => {
  assert.equal(safeTimeoutMs(undefined, 1000), 1000);
  assert.equal(safeTimeoutMs(null, 1000), 1000);
  assert.equal(safeTimeoutMs("5000", 1000), 1000);
  assert.equal(safeTimeoutMs(NaN, 1000), 1000);
  assert.equal(safeTimeoutMs(-5, 1000), 1000);
  assert.equal(safeTimeoutMs(0, 1000), 1000);
});

test("safeTimeoutMs caps at 10 minutes", () => {
  assert.equal(safeTimeoutMs(10 * 60_000, 1000), 10 * 60_000);
  assert.equal(safeTimeoutMs(10 * 60_000 + 1, 1000), 10 * 60_000);
  // Infinity is treated as bad input (Number.isFinite is false) and returns
  // the fallback. This is intentional: "Infinity ms" is not a meaningful
  // timeout. Callers who want "as long as possible" should pass 10 * 60_000.
  assert.equal(safeTimeoutMs(Number.POSITIVE_INFINITY, 1000), 1000);
});

test("safeTimeoutMs floors non-integer values", () => {
  assert.equal(safeTimeoutMs(1234.9, 1000), 1234);
  assert.equal(safeTimeoutMs(0.5, 1000), 1000); // 0 is invalid → fallback
});

test("HerdrClient returns a clean error when herdr is not running", async () => {
  // Point at a path that definitely doesn't exist as a socket.
  const client = new HerdrClient({ socketPath: "/tmp/definitely-not-herdr.sock" });
  const result = await client.request("ping", {}, { timeoutMs: 1000 });
  assert.equal(result.ok, false);
  if (result.ok) return; // type narrowing
  assert.ok(
    result.code === "client_error" || result.code === "socket_not_found",
    `expected client_error or socket_not_found, got ${result.code}`,
  );
  assert.ok(typeof result.error === "string" && result.error.length > 0);
});

test("HerdrClient ping with a 1s timeout returns ok=false fast", async () => {
  const client = new HerdrClient({ socketPath: "/tmp/definitely-not-herdr.sock" });
  const t0 = Date.now();
  // ping() returns a plain boolean, not a ToolResult — verify that path too.
  const alive = await client.ping(1000);
  const elapsed = Date.now() - t0;
  assert.equal(alive, false);
  // Should fail quickly (well under the timeout) because the socket doesn't exist
  assert.ok(elapsed < 5000, `ping took ${elapsed}ms; expected fast-fail`);
});

test("HerdrClient.request never throws to the caller", async () => {
  const client = new HerdrClient({ socketPath: "/tmp/definitely-not-herdr.sock" });
  // Should not throw even with garbage input
  let threw = false;
  try {
    await client.request("garbage.method", { weird: "stuff" }, { timeoutMs: 500 });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "request must not throw to the caller");
});

// Optional live test — only runs if HERDR_TEST_LIVE=1 and herdr is up.
test("HerdrClient can ping a live herdr server (opt-in)", { skip: !process.env.HERDR_TEST_LIVE }, async () => {
  const client = new HerdrClient();
  // ping() returns a plain boolean
  const alive = await client.ping(3000);
  assert.equal(alive, true, "ping should succeed against a live herdr server");
});
