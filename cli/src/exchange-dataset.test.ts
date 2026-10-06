import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { EXCHANGE_PROFILES, generateExchangeDataset } from "./exchange-dataset.js";
import { generateDatasetContent, expandSizeCells } from "./mutations.js";

function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x1_0000_0000; };
}
const root = new URL("../../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const ajv = new Ajv2020({ strict: false, allErrors: true });
const validInput = ajv.compile(read("schemas/arena-exchange-input.schema.json"));
const validOutput = ajv.compile(read("schemas/implementation-output.schema.json"));

test("arena-exchange manifest and worked example satisfy schemas", () => {
  const manifest = read("benchmarks/arena-exchange/benchmark.json");
  assert.ok(ajv.compile(read("schemas/benchmark.schema.json"))(manifest));
  assert.equal(expandSizeCells(manifest.sizes, "small").length, 5);
  assert.equal(expandSizeCells(manifest.sizes, "medium").length, 5);
  assert.equal(expandSizeCells(manifest.sizes, "large").length, 1);
  assert.ok(validInput(read("benchmarks/arena-exchange/fixtures/example.json")), JSON.stringify(validInput.errors));
  const output = read("benchmarks/arena-exchange/fixtures/example-output.json");
  assert.ok(validOutput(output), JSON.stringify(validOutput.errors));
  const missing = { ...output }; delete missing.eventChecksum;
  assert.equal(validOutput(missing), false);
  assert.equal(validOutput({ ...output, extra: 1 }), false);
  assert.equal(validOutput({ ...output, bookChecksum: "BAD" }), false);
});

for (const profile of EXCHANGE_PROFILES) {
  test(`arena-exchange ${profile} is deterministic, schema-valid, and committed`, () => {
    const first = generateDatasetContent("arena-exchange", "small", profile, 729418, seeded(729418));
    assert.equal(first, generateExchangeDataset("small", profile, seeded(729418)));
    const path = `benchmarks/arena-exchange/datasets/small-${profile}.json`;
    assert.equal(first, readFileSync(new URL(path, root), "utf8"));
    assert.equal(createHash("sha256").update(first).digest("hex"), read(`${path}.metadata.json`).sha256);
    const input = JSON.parse(first);
    assert.ok(validInput(input), JSON.stringify(validInput.errors?.slice(0, 2)));
    assert.equal(input.events.length, 50_000);
    assert.equal(input.instruments.length, 16);
    assert.equal(input.accounts.length, 2_000);
    const events: number[][] = input.events;
    assert.deepEqual(events.at(-1), [10, 50_000]);
    assert.ok(events.every((e, index) => e[1] === index + 1));
    const orders = events.filter(e => e[0] === 0 || e[0] === 1);
    assert.equal(new Set(orders.map(e => e[2])).size, orders.length);
    if (profile === "hot-symbols") assert.ok(orders.filter(e => e[4] === 1).length / orders.length > 0.85);
    const limits = orders.filter(e => e[0] === 0);
    const crosses = (e: number[]) => e[0] === 1 || (e[5] === 0 ? e[6]! >= 10_020 : e[6]! <= 9_980);
    if (profile === "deep-book") assert.ok(limits.filter(e => !crosses(e)).length / limits.length >= 0.8);
    // The Go fixture tests measure actual crossing rates by replaying books;
    // price alone cannot identify crossings after taker remainders rest.
    if (profile === "crossing-burst") {
      assert.ok(orders.filter(e => e[0] === 1).length / orders.length > 0.25);
      assert.ok(limits.some(e => e[7]! >= 1_000));
    }
    if (profile === "cancel-storm") assert.ok(events.filter(e => e[0] === 2 || e[0] === 3).length / events.length > 0.4);
  });
}

test("arena-exchange seeds vary and unsupported profiles reject", () => {
  assert.notEqual(generateExchangeDataset("small", "balanced-session", seeded(1)), generateExchangeDataset("small", "balanced-session", seeded(2)));
  assert.throws(() => generateExchangeDataset("large", "deep-book", seeded(1)), /No arena-exchange generation profile/);
  assert.throws(() => generateExchangeDataset("small", "unknown", seeded(1)), /No arena-exchange generation profile/);
});
