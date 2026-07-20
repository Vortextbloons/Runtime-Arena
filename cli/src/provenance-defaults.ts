import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LanguageProvenance, ProvenanceInput, ProvenanceProbe } from "./provenance.js";

type LanguageManifest = {
  id: string;
  detect: { command: string; arguments: string[] };
  provenance?: LanguageProvenance;
};

type DefaultsFile = Record<string, LanguageProvenance>;

let cachedDefaults: DefaultsFile | null = null;

async function loadDefaults(root: string) {
  if (cachedDefaults) return cachedDefaults;
  const file = path.join(root, "languages", "protocol", "provenance.defaults.json");
  cachedDefaults = JSON.parse(await readFile(file, "utf8")) as DefaultsFile;
  return cachedDefaults;
}

function mergeProbes(base: ProvenanceProbe[] = [], override: ProvenanceProbe[] = []) {
  const merged = new Map(base.map(probe => [probe.id, probe]));
  for (const probe of override) merged.set(probe.id, probe);
  return [...merged.values()];
}

function mergeInputs(base: ProvenanceInput[] = [], override: ProvenanceInput[] = []) {
  const merged = new Map(base.map(input => [input.path, input]));
  for (const input of override) merged.set(input.path, input);
  return [...merged.values()];
}

export async function resolveLanguageProvenance(root: string, language: LanguageManifest): Promise<LanguageProvenance> {
  const defaults = await loadDefaults(root);
  const family = defaults[language.id] ?? {};
  const manifest = language.provenance ?? {};
  const runtimeProbe: ProvenanceProbe = {
    id: "runtime",
    command: language.detect.command,
    arguments: language.detect.arguments
  };
  const probes = mergeProbes(
    family.probes?.length ? family.probes : [runtimeProbe],
    manifest.probes ?? []
  );
  const externalInputs = mergeInputs(family.externalInputs, manifest.externalInputs);
  const environmentAllowlist = [...new Set([
    ...(family.environmentAllowlist ?? []),
    ...(manifest.environmentAllowlist ?? [])
  ])];
  return {
    ...(environmentAllowlist.length ? { environmentAllowlist } : {}),
    ...(externalInputs.length ? { externalInputs } : {}),
    probes
  };
}
