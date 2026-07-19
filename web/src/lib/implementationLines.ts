import manifest from './data/implementation-lines.json' with { type: 'json' };

export type ImplementationLinesCell = {
	logicalLines: number;
	fileCount: number;
	files: string[];
	sha256: string;
};

export type ImplementationLinesManifest = {
	version: number;
	generatedAt: string;
	cells: Record<string, ImplementationLinesCell>;
};

export const IMPLEMENTATION_LINES_MANIFEST = manifest as ImplementationLinesManifest;

export function implementationCellKey(benchmarkId: string, languageId: string): string {
	return `${benchmarkId}:${languageId}`;
}

export function averageLogicalLinesForLanguage(
	languageId: string,
	benchmarkIds: string[],
	linesManifest: ImplementationLinesManifest = IMPLEMENTATION_LINES_MANIFEST
): number | null {
	const values: number[] = [];
	for (const benchmarkId of benchmarkIds) {
		const cell = linesManifest.cells[implementationCellKey(benchmarkId, languageId)];
		if (cell) values.push(cell.logicalLines);
	}
	if (!values.length) return null;
	return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Performance points earned per 100 logical source lines. */
export function codeEconomyRaw(performance: number, averageLogicalLines: number): number | null {
	if (!Number.isFinite(performance) || performance <= 0) return null;
	if (!Number.isFinite(averageLogicalLines) || averageLogicalLines <= 0) return null;
	return (performance / averageLogicalLines) * 100;
}
