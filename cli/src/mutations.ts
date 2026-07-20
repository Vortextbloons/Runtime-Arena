export const MUTATION_BENCHMARKS = new Set([
  "record-sorting",
  "shortest-path",
  "word-frequency",
  "matrix-multiplication"
]);

export const GENERATOR_VERSION = "2.2.0";

export type MutationEntry = { dataset: string; seed: number };
export type SizeConfig = {
  warmupIterations: number;
  measuredIterations?: number;
  dataset?: string;
  mutations?: Record<string, MutationEntry>;
};
export type SizeCell = {
  sizeName: string;
  mutation?: string;
  dataset: string;
  seed?: number;
  warmupIterations: number;
  measuredIterations?: number;
};

export function expandSizeCells(sizes: Record<string, SizeConfig>, sizeName: string, mutationFilter?: string): SizeCell[] {
  const size = sizes[sizeName];
  if (!size) return [];
  if (size.mutations) {
    return Object.entries(size.mutations)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .filter(([mutation]) => !mutationFilter || mutation === mutationFilter)
      .map(([mutation, entry]) => ({
        sizeName,
        mutation,
        dataset: entry.dataset,
        seed: entry.seed,
        warmupIterations: size.warmupIterations,
        measuredIterations: size.measuredIterations
      }));
  }
  if (mutationFilter) return [];
  return [{
    sizeName,
    dataset: size.dataset!,
    warmupIterations: size.warmupIterations,
    measuredIterations: size.measuredIterations
  }];
}

export function cellKey(benchmarkId: string, size: string, languageId: string, mutation?: string) {
  return mutation ? `${benchmarkId}/${size}/${mutation}/${languageId}` : `${benchmarkId}/${size}/${languageId}`;
}

export function groupKey(benchmarkId: string, size: string, mutation?: string) {
  return mutation ? `${benchmarkId}/${size}/${mutation}` : `${benchmarkId}/${size}`;
}

export function generateDatasetContent(
  benchmarkId: string,
  sizeName: string,
  mutation: string | undefined,
  _seed: number,
  random: () => number
): string {
  if (benchmarkId === "record-sorting") return generateRecordSorting(sizeName, mutation ?? "random", random);
  if (benchmarkId === "shortest-path") return generateShortestPath(sizeName, mutation ?? "sparse", random);
  if (benchmarkId === "word-frequency") return generateWordFrequency(sizeName, mutation ?? "repeated-vocabulary", random);
  if (benchmarkId === "matrix-multiplication") return generateMatrixMultiplication(sizeName, mutation ?? "row-major", random);
  throw new Error(`No mutation generator registered for ${benchmarkId}`);
}

function generateRecordSorting(sizeName: string, mutation: string, random: () => number): string {
  const recordCount = { small: 20_000, medium: 100_000, large: 500_000 }[sizeName];
  if (!recordCount) throw new Error(`No record-sorting generation profile for size '${sizeName}'`);
  const records = Array.from({ length: recordCount }, (_, index) => ({
    id: index + 1,
    score: Math.floor(random() * 1_000),
    timestamp: 1_700_000_000_000 + Math.floor(random() * 10_000)
  }));
  if (mutation === "random") {
    return `${JSON.stringify({ records })}\n`;
  }
  if (mutation === "mostly-sorted") {
    records.sort((a, b) => b.score - a.score || a.timestamp - b.timestamp || a.id - b.id);
    const swaps = Math.max(1, Math.floor(recordCount * 0.05));
    for (let i = 0; i < swaps; i++) {
      const left = Math.floor(random() * recordCount);
      const right = Math.floor(random() * recordCount);
      [records[left], records[right]] = [records[right]!, records[left]!];
    }
    return `${JSON.stringify({ records })}\n`;
  }
  throw new Error(`Unknown record-sorting mutation '${mutation}'`);
}

function generateShortestPath(sizeName: string, mutation: string, random: () => number): string {
  const vertexCount = { small: 400, medium: 500, large: 600 }[sizeName];
  const queryCount = { small: 120, medium: 110, large: 180 }[sizeName];
  if (!vertexCount || !queryCount) throw new Error(`No shortest-path generation profile for size '${sizeName}'`);
  const targetEdges = mutation === "dense"
    ? vertexCount * 8
    : mutation === "sparse"
      ? vertexCount * 2
      : -1;
  if (targetEdges < 0) throw new Error(`Unknown shortest-path mutation '${mutation}'`);
  const edges: Array<{ from: number; to: number; weight: number }> = [];
  const edgeKeys = new Set<string>();
  for (let i = 0; i < vertexCount - 1; i++) {
    edges.push({ from: i, to: i + 1, weight: 1 + Math.floor(random() * 20) });
    edgeKeys.add(`${i}:${i + 1}`);
  }
  while (edges.length < targetEdges) {
    const from = Math.floor(random() * vertexCount);
    const to = Math.floor(random() * vertexCount);
    const key = `${from}:${to}`;
    if (from !== to && !edgeKeys.has(key)) {
      edges.push({ from, to, weight: 1 + Math.floor(random() * 100) });
      edgeKeys.add(key);
    }
  }
  const queries = Array.from({ length: queryCount }, (_, i) => ({
    id: i + 1,
    source: Math.floor(random() * vertexCount),
    destination: Math.floor(random() * vertexCount)
  }));
  return `${JSON.stringify({ vertexCount, edges, queries })}\n`;
}

function generateWordFrequency(sizeName: string, mutation: string, random: () => number): string {
  const profile = {
    small: { totalWords: 50_000, uniqueWords: 3_421 },
    medium: { totalWords: 50_000, uniqueWords: 3_421 },
    large: { totalWords: 200_000, uniqueWords: 8_421 }
  }[sizeName];
  if (!profile) throw new Error(`No word-frequency generation profile for size '${sizeName}'`);
  const vocabulary = Array.from({ length: profile.uniqueWords }, (_, index) => `word-${String(index).padStart(5, "0")}`);
  const words: string[] = [];
  if (mutation === "repeated-vocabulary") {
    while (words.length < profile.totalWords) {
      const rank = Math.floor(Math.pow(random(), 2) * profile.uniqueWords);
      words.push(vocabulary[rank]!);
    }
  } else if (mutation === "mostly-unique") {
    const used = new Set<number>();
    while (words.length < profile.totalWords) {
      if (used.size < profile.uniqueWords && random() < 0.92) {
        let index = Math.floor(random() * profile.uniqueWords);
        while (used.has(index)) index = (index + 1) % profile.uniqueWords;
        used.add(index);
        words.push(vocabulary[index]!);
      } else {
        words.push(vocabulary[Math.floor(random() * profile.uniqueWords)]!);
      }
    }
  } else {
    throw new Error(`Unknown word-frequency mutation '${mutation}'`);
  }
  for (let index = words.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [words[index], words[other]] = [words[other]!, words[index]!];
  }
  return `${JSON.stringify({ words })}\n`;
}

function generateMatrixMultiplication(sizeName: string, mutation: string, random: () => number): string {
  const dimension = { small: 128, medium: 256, large: 512 }[sizeName];
  if (!dimension) throw new Error(`No matrix-multiplication generation profile for size '${sizeName}'`);
  const elementCount = dimension * dimension;
  const fill = (layout: "row-major" | "column-major") => {
    const values = new Array<number>(elementCount);
    if (layout === "row-major") {
      for (let i = 0; i < elementCount; i++) values[i] = Math.floor(random() * 21) - 10;
    } else {
      for (let col = 0; col < dimension; col++) {
        for (let row = 0; row < dimension; row++) {
          values[row * dimension + col] = Math.floor(random() * 21) - 10;
        }
      }
    }
    return values;
  };
  if (mutation === "row-major") {
    return `${JSON.stringify({ dimension, left: fill("row-major"), right: fill("row-major") })}\n`;
  }
  if (mutation === "column-major") {
    return `${JSON.stringify({ dimension, left: fill("column-major"), right: fill("column-major") })}\n`;
  }
  throw new Error(`Unknown matrix-multiplication mutation '${mutation}'`);
}
