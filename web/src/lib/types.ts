export type Sample = {
	iteration: number;
	valid: boolean;
	kernelTimeNanoseconds: number;
	exitCode: number;
	outputSizeBytes: number;
	peakMemoryBytes?: number;
	cpuTimeNanoseconds?: number;
};

export type StartupMeasurement = {
	durationNanoseconds: number;
	mode: string;
};

export type MemoryMeasurement = {
	peakResidentBytes: number;
	collector: string;
};

export type ParallelMeasurement = {
	workerCount: number;
	singleWorkerBaselineNanoseconds: number;
	multiWorkerNanoseconds: number;
};

export type ArenaResult = {
	benchmark: { id: string; version: number; size: string; mutation?: string };
	dataset?: { id: string; sha256: string; seed?: number; mutation?: string; generatorVersion?: string };
	language: { id: string; name: string; version: string; compilerVersion?: string };
	build?: {
		status: 'success' | 'failed' | 'skipped' | 'cached';
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
		/** Explicit process/runtime startup, separate from kernel workload time. */
		startup?: StartupMeasurement;
		/** Peak resident memory with collector identity for cross-language comparison. */
		memory?: MemoryMeasurement;
		/** Legacy alias used by some collectors before `memory.collector`. */
		memoryCollector?: string;
		/** Multi-worker scaling samples for Parallelism attribute. */
		parallel?: ParallelMeasurement;
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

export type MutationScore = {
	mutation?: string;
	result: ArenaResult;
	medianNanoseconds: number;
	fastestMedianNanoseconds: number;
	p95Nanoseconds: number;
	variation: number;
	performance: number;
	consistency: number;
};

export type SizeScore = {
	size: string;
	mutations: MutationScore[];
	result: ArenaResult;
	medianNanoseconds: number;
	fastestMedianNanoseconds: number;
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
	versatility: number | null;
	sizes: SizeScore[];
	expectedSizes: string[];
	diagnostics: string[];
	benchmarks?: Array<{
		benchmarkId: string;
		overall: number;
		performance: number;
		consistency: number;
		versatility: number;
	}>;
};
