import assert from "node:assert/strict";
import test from "node:test";
import { runPool } from "./pool.js";

test("runPool processes every item within the concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  const seen: number[] = [];

  await runPool([1, 2, 3, 4], 2, async item => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    seen.push(item);
    active -= 1;
  });

  assert.deepEqual(seen.sort((left, right) => left - right), [1, 2, 3, 4]);
  assert.ok(peak <= 2);
});

test("runPool propagates task failures", async () => {
  await assert.rejects(
    runPool([1, 2, 3], 2, async item => {
      if (item === 2) throw new Error("task failed");
    }),
    /task failed/
  );
});

test("runPool rejects invalid concurrency", async () => {
  await assert.rejects(runPool([1], 0, async () => undefined), /positive integer/);
});
