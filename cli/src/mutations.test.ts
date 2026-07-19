import assert from "node:assert/strict";
import test from "node:test";
import { cellKey, expandSizeCells, generateDatasetContent } from "../src/mutations.js";

function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

test("expandSizeCells returns mutation variants when configured", () => {
  const cells = expandSizeCells({
    medium: {
      warmupIterations: 2,
      measuredIterations: 3,
      mutations: {
        random: { dataset: "medium-random.json", seed: 729418 },
        "mostly-sorted": { dataset: "medium-mostly-sorted.json", seed: 729418 }
      }
    }
  }, "medium");
  assert.equal(cells.length, 2);
  assert.deepEqual(cells.map((cell) => cell.mutation), ["mostly-sorted", "random"]);
});

test("cellKey includes mutation when present", () => {
  assert.equal(cellKey("record-sorting", "medium", "rust", "random"), "record-sorting/medium/random/rust");
  assert.equal(cellKey("aggregation", "small", "rust"), "aggregation/small/rust");
});

test("mutation generators are deterministic from seed", () => {
  const random = seeded(729418);
  const first = generateDatasetContent("record-sorting", "small", "random", 729418, random);
  const second = generateDatasetContent("record-sorting", "small", "random", 729418, seeded(729418));
  assert.equal(first, second);
  assert.notEqual(
    generateDatasetContent("record-sorting", "small", "random", 729418, seeded(729418)),
    generateDatasetContent("record-sorting", "small", "mostly-sorted", 729418, seeded(729418))
  );
});
