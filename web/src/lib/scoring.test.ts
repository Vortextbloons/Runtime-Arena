import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreBenchmark, scoreOverall } from './scoring.ts';
import type { ArenaResult } from './types.ts';

function result(
	language: string,
	size: string,
	median: number,
	options: { deviation?: number; status?: string; valid?: number; measured?: number } = {}
): ArenaResult {
	const measured = options.measured ?? 5;
	return {
		benchmark: { id: 'work', version: 1, size },
		language: { id: language, name: language, version: '1' },
		execution: {
			measuredIterations: measured,
			samples: [],
			summary: {
				validSamples: options.valid ?? measured,
				medianKernelTimeNanoseconds: median,
				meanKernelTimeNanoseconds: median,
				standardDeviationKernelTimeNanoseconds: options.deviation ?? 0,
				p95KernelTimeNanoseconds: median
			}
		},
		checker: { status: options.status ?? 'accepted', diagnostics: [] }
	};
}

test('performance is proportional to the fastest valid median', () => {
	const scores = scoreBenchmark([result('fast', 'small', 1_000_000), result('slow', 'small', 2_000_000)], 'work');
	assert.equal(scores.find((score) => score.language.id === 'fast')?.performance, 100);
	assert.equal(scores.find((score) => score.language.id === 'slow')?.performance, 63.728031366);
});

test('consistency scores zero variation at 100 and caps at zero', () => {
	const scores = scoreBenchmark(
		[result('steady', 'small', 1_000_000), result('noisy', 'small', 1_000_000, { deviation: 250_000 })],
		'work'
	);
	assert.equal(scores.find((score) => score.language.id === 'steady')?.consistency, 100);
	assert.equal(scores.find((score) => score.language.id === 'noisy')?.consistency, 0);
});

test('versatility penalizes weakness in any benchmark', () => {
	const rows = [
		result('balanced', 'small', 1_000_000),
		{ ...result('balanced', 'small', 1_000_000), benchmark: { id: 'other', version: 1, size: 'small' } },
		result('lopsided', 'small', 1_000_000),
		{ ...result('lopsided', 'small', 8_000_000), benchmark: { id: 'other', version: 1, size: 'small' } }
	];
	const scores = scoreOverall(rows);
	const balanced = scores.find((score) => score.language.id === 'balanced');
	const lopsided = scores.find((score) => score.language.id === 'lopsided');
	assert.equal(balanced?.versatility, 100);
	assert.ok(lopsided!.versatility! < balanced!.versatility!);
});

test('missing, incorrect, and incomplete results are unranked', () => {
	const scores = scoreBenchmark(
		[
			result('valid', 'small', 1_000_000),
			result('valid', 'large', 1_000_000),
			result('missing', 'small', 1_000_000),
			result('incorrect', 'small', 1_000_000, { status: 'wrong-answer' }),
			result('incorrect', 'large', 1_000_000),
			result('incomplete', 'small', 1_000_000, { valid: 4 }),
			result('incomplete', 'large', 1_000_000)
		],
		'work'
	);
	for (const id of ['missing', 'incorrect', 'incomplete']) {
		const score = scores.find((entry) => entry.language.id === id);
		assert.equal(score?.eligible, false);
		assert.equal(score?.overall, null);
	}
});

test('benchmark overall equals speed when stability is diagnostic only', () => {
	const score = scoreBenchmark([result('only', 'small', 1_000_000, { deviation: 250_000 })], 'work')[0]!;
	assert.equal(score.performance, 100);
	assert.equal(score.consistency, 0);
	assert.equal(score.versatility, null);
	assert.equal(score.overall, 100);
});

test('overall uses a 75/25 speed and flexibility split', () => {
	const rows = [
		result('lang', 'small', 4_000_000),
		result('peer', 'small', 1_000_000),
		{ ...result('lang', 'small', 1_000_000), benchmark: { id: 'other', version: 1, size: 'small' } },
		{ ...result('peer', 'small', 4_000_000), benchmark: { id: 'other', version: 1, size: 'small' } }
	];
	const scores = scoreOverall(rows);
	const lang = scores.find((score) => score.language.id === 'lang');
	assert.equal(lang?.performance, 63.728031366);
	assert.equal(lang?.versatility, 52.490095854);
	assert.equal(lang?.overall, 60.918547488);
});

test('overall view uses a geometric mean across benchmarks', () => {
	const rows = [
		result('fast', 'small', 1_000_000),
		result('slow', 'small', 4_000_000),
		{ ...result('fast', 'small', 4_000_000), benchmark: { id: 'other', version: 1, size: 'small' } },
		{ ...result('slow', 'small', 1_000_000), benchmark: { id: 'other', version: 1, size: 'small' } }
	];
	const scores = scoreOverall(rows);
	assert.equal(scores[0]?.performance, 63.728031366);
	assert.equal(scores[1]?.performance, 63.728031366);
	assert.equal(scores[0]?.overall, 60.918547488);
});

test('overall still ranks a language that skips one benchmark', () => {
	const rows = [
		result('rust', 'small', 1_000_000),
		{ ...result('rust', 'small', 1_000_000), benchmark: { id: 'barrier-wave', version: 1, size: 'small' } },
		result('lua', 'small', 2_000_000)
		// lua has no barrier-wave results
	];
	const scores = scoreOverall(rows);
	const lua = scores.find((score) => score.language.id === 'lua');
	const rust = scores.find((score) => score.language.id === 'rust');

	assert.equal(lua?.eligible, true);
	assert.equal(lua?.overall, 63.728031366);
	assert.deepEqual(
		lua?.benchmarks?.map((entry) => entry.benchmarkId),
		['work']
	);
	assert.ok(lua?.diagnostics.some((line) => /Skipped barrier-wave/.test(line)));

	assert.equal(rust?.eligible, true);
	assert.equal(rust?.overall, 100);
	assert.deepEqual(
		rust?.benchmarks?.map((entry) => entry.benchmarkId).toSorted(),
		['barrier-wave', 'work']
	);
});

test('overall stays unranked when every benchmark is ineligible', () => {
	const rows = [
		result('broken', 'small', 1_000_000, { status: 'wrong-answer' }),
		{ ...result('ok', 'small', 1_000_000), benchmark: { id: 'other', version: 1, size: 'small' } }
	];
	const scores = scoreOverall(rows);
	const broken = scores.find((score) => score.language.id === 'broken');
	assert.equal(broken?.eligible, false);
	assert.equal(broken?.overall, null);
});

test('an entire sub-millisecond size tier is excluded from every language score', () => {
	const scores = scoreBenchmark([
		result('fast', 'small', 500_000),
		result('slow', 'small', 2_000_000),
		result('fast', 'large', 2_000_000),
		result('slow', 'large', 4_000_000)
	], 'work');
	assert.deepEqual(scores[0]?.expectedSizes, ['large']);
	assert.equal(scores.find((score) => score.language.id === 'slow')?.performance, 63.728031366);
});
