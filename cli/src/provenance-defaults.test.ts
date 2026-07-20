import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveLanguageProvenance } from "./provenance-defaults.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("resolveLanguageProvenance merges defaults and detect probe", async () => {
  const provenance = await resolveLanguageProvenance(root, {
    id: "go",
    detect: { command: "go", arguments: ["version"] },
    provenance: { probes: [{ id: "compiler", command: "go", arguments: ["version"] }] }
  });
  assert.ok(provenance.probes?.some(probe => probe.id === "compiler"));
  assert.ok(provenance.externalInputs?.some(input => input.path.includes("go.mod")));
});

test("resolveLanguageProvenance synthesizes runtime probe for unknown ids", async () => {
  const provenance = await resolveLanguageProvenance(root, {
    id: "demo-language",
    detect: { command: "demo", arguments: ["--version"] }
  });
  assert.deepEqual(provenance.probes, [{ id: "runtime", command: "demo", arguments: ["--version"] }]);
});
