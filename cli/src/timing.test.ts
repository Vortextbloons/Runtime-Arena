import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readTimingSamples } from "./timing.js";

async function sidecar(value: unknown) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arena-timing-"));
  const file = path.join(directory, "timing.json");
  await writeFile(file, typeof value === "string" ? value : JSON.stringify(value));
  return { file, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("accepts exact kernel timing samples", async () => {
  const fixture = await sidecar({ samples: [{ iteration: 1, kernelTimeNanoseconds: 0 }] });
  try { assert.deepEqual(await readTimingSamples(fixture.file, 1), [{ iteration: 1, kernelTimeNanoseconds: 0 }]); }
  finally { await fixture.cleanup(); }
});

for (const [name, value, expected] of [
  ["malformed JSON", "{", 1],
  ["wrong count", { samples: [] }, 1],
  ["negative duration", { samples: [{ iteration: 1, kernelTimeNanoseconds: -1 }] }, 1],
  ["fractional duration", { samples: [{ iteration: 1, kernelTimeNanoseconds: 1.5 }] }, 1],
  ["wrong iteration", { samples: [{ iteration: 2, kernelTimeNanoseconds: 1 }] }, 1],
  ["extra fields", { samples: [{ iteration: 1, kernelTimeNanoseconds: 1, extra: true }] }, 1]
] as const) {
  test(`rejects ${name}`, async () => {
    const fixture = await sidecar(value);
    try { await assert.rejects(readTimingSamples(fixture.file, expected)); }
    finally { await fixture.cleanup(); }
  });
}
