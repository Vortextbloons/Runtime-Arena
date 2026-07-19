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
	assert.equal(scores.find((score) => score.language.id === 'slow')?.performance, 50);
});

test('consistency scores zero variation at 100 and caps at zero', () => {
	const scores = scoreBenchmark(
		[result('steady', 'small', 1_000_000), result('noisy', 'small', 1_000_000, { deviation: 250_000 })],
		'work'
	);
	assert.equal(scores.find((score) => score.language.id === 'steady')?.consistency, 100);
	assert.equal(scores.find((score) => score.language.id === 'noisy')?.consistency, 0);
});

test('scalability measures retention of relative performance across sizes', () => {
	const scores = scoreBenchmark(
		[
			result('leader', 'small', 1_000_000),
			result('leader', 'large', 1_000_000),
			result('variable', 'small', 1_000_000),
			result('variable', 'large', 2_000_000)
		],
		'work'
	);
	assert.equal(scores.find((score) => score.language.id === 'leader')?.scalability, 100);
	assert.equal(scores.find((score) => score.language.id === 'variable')?.scalability, 50);
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

test('diagnostics do not change overall speed and single-size scalability defaults to 100', () => {
	const score = scoreBenchmark([result('only', 'small', 1_000_000, { deviation: 250_000 })], 'work')[0]!;
	assert.equal(score.performance, 100);
	assert.equal(score.consistency, 0);
	assert.equal(score.scalability, 100);
	assert.equal(score.overall, 100);
});

test('overall view uses a geometric mean across benchmarks', () => {
	const rows = [
		result('fast', 'small', 1_000_000),
		result('slow', 'small', 4_000_000),
		{ ...result('fast', 'small', 4_000_000), benchmark: { id: 'other', version: 1, size: 'small' } },
		{ ...result('slow', 'small', 1_000_000), benchmark: { id: 'other', version: 1, size: 'small' } }
	];
	const scores = scoreOverall(rows);
	assert.equal(scores[0]?.performance, 50);
	assert.equal(scores[1]?.performance, 50);
	assert.equal(scores[0]?.overall, 50);
});

test('an entire sub-millisecond size tier is excluded from every language score', () => {
	const scores = scoreBenchmark([
		result('fast', 'small', 500_000),
		result('slow', 'small', 2_000_000),
		result('fast', 'large', 2_000_000),
		result('slow', 'large', 4_000_000)
	], 'work');
	assert.deepEqual(scores[0]?.expectedSizes, ['large']);
	assert.equal(scores.find((score) => score.language.id === 'slow')?.performance, 50);
});
