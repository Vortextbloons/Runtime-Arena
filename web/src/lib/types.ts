export type Sample = {
	iteration: number;
	valid: boolean;
	kernelTimeNanoseconds: number;
	exitCode: number;
	outputSizeBytes: number;
	peakMemoryBytes?: number;
	cpuTimeNanoseconds?: number;
};

export type ArenaResult = {
	benchmark: { id: string; version: number; size: string };
	dataset?: { id: string; sha256: string; seed?: number };
	language: { id: string; name: string; version: string };
	build?: {
		status: 'success' | 'failed' | 'skipped';
		durationNanoseconds: number;
		artifactSizeBytes?: number;
		command: string[];
	};
	execution: {
		mode: 'persistent-worker';
		measurementContractVersion?: string;
		totalProcessDurationNanoseconds?: number;
		warmupIterations?: number;
		measuredIterations: number;
		samples: Sample[];
		summary: {
			validSamples: number;
			rejectedSamples?: number;
			medianKernelTimeNanoseconds: number;
			minimumKernelTimeNanoseconds?: number;
			maximumKernelTimeNanoseconds?: number;
			meanKernelTimeNanoseconds?: number;
			standardDeviationKernelTimeNanoseconds?: number;
			p95KernelTimeNanoseconds: number;
		};
		metrics?: Record<string, { status: string; reason?: string }>;
	};
	checker: { status: string; diagnostics: string[] };
	provenance: {
		fingerprint: string;
		measuredAt: string;
		machine: {
			cpu: { model: string; architecture: string; logicalCores: number };
			memoryBytes: number;
			operatingSystem: { platform: string; release: string };
		};
	};
};

export type ArenaRun = {
	snapshotId: string;
	updatedAt: string;
	arenaVersion: string;
	gitCommit?: string;
	results: ArenaResult[];
};

export type SizeScore = {
	size: string;
	result: ArenaResult;
	medianNanoseconds: number;
	p95Nanoseconds: number;
	variation: number;
	performance: number;
	consistency: number;
};

export type BenchmarkScore = {
	benchmarkId: string;
	language: ArenaResult['language'];
	eligible: boolean;
	overall: number | null;
	performance: number | null;
	consistency: number | null;
	scalability: number | null;
	sizes: SizeScore[];
	expectedSizes: string[];
	diagnostics: string[];
	benchmarks?: Array<{
		benchmarkId: string;
		overall: number;
		performance: number;
		consistency: number;
		scalability: number;
	}>;
};
