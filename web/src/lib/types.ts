export type Sample = {
	iteration: number;
	valid: boolean;
	wallTimeNanoseconds: number;
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
		mode?: 'cold-process' | 'warmed-process' | 'persistent-worker';
		warmupIterations?: number;
		measuredIterations: number;
		samples: Sample[];
		summary: {
			validSamples: number;
			rejectedSamples?: number;
			medianWallTimeNanoseconds: number;
			minimumWallTimeNanoseconds?: number;
			maximumWallTimeNanoseconds?: number;
			meanWallTimeNanoseconds?: number;
			standardDeviationWallTimeNanoseconds?: number;
			p95WallTimeNanoseconds: number;
		};
		metrics?: Record<string, { status: string; reason?: string }>;
	};
	checker: { status: string; diagnostics: string[] };
};

export type ArenaRun = {
	runId: string;
	createdAt: string;
	arenaVersion: string;
	gitCommit?: string;
	environment: {
		cpu: { model: string; logicalCores: number };
		memoryBytes: number;
		operatingSystem: { platform: string; release: string };
	};
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
