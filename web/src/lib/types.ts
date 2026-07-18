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
	language: { id: string; name: string; version: string };
	execution: {
		samples: Sample[];
		summary: {
			validSamples: number;
			medianWallTimeNanoseconds: number;
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
