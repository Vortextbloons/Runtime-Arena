import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBenchmarkLabel, getScoreTier, languageMonogram } from './tiers.ts';

test('getScoreTier maps null to unverified tierLevel 0', () => {
	const tier = getScoreTier(null);
	assert.equal(tier.class, 'unranked');
	assert.equal(tier.tierLevel, 0);
	assert.equal(tier.tag, '—');
	assert.equal(tier.name, 'UNVERIFIED');
});

test('getScoreTier boundary thresholds inclusive and exclusive', () => {
	const cases: Array<{ score: number; class: string; tierLevel: number }> = [
		{ score: 100, class: 'dark-matter', tierLevel: 9 },
		{ score: 99.5, class: 'prismatic-opal', tierLevel: 8 },
		{ score: 99, class: 'prismatic-opal', tierLevel: 8 },
		{ score: 98.9, class: 'galaxy-opal', tierLevel: 7 },
		{ score: 94.9, class: 'pink-diamond', tierLevel: 6 },
		{ score: 95, class: 'galaxy-opal', tierLevel: 7 },
		{ score: 89.9, class: 'diamond', tierLevel: 5 },
		{ score: 90, class: 'pink-diamond', tierLevel: 6 },
		{ score: 79.9, class: 'amethyst', tierLevel: 4 },
		{ score: 80, class: 'diamond', tierLevel: 5 },
		{ score: 69.9, class: 'ruby', tierLevel: 3 },
		{ score: 70, class: 'amethyst', tierLevel: 4 },
		{ score: 59.9, class: 'sapphire', tierLevel: 2 },
		{ score: 60, class: 'ruby', tierLevel: 3 },
		{ score: 44.9, class: 'emerald', tierLevel: 1 },
		{ score: 45, class: 'sapphire', tierLevel: 2 },
		{ score: 0, class: 'emerald', tierLevel: 1 }
	];

	for (const { score, class: expectedClass, tierLevel } of cases) {
		const tier = getScoreTier(score);
		assert.equal(tier.class, expectedClass, `score ${score} class`);
		assert.equal(tier.tierLevel, tierLevel, `score ${score} tierLevel`);
		assert.ok(tier.glow);
		assert.ok(tier.gradient);
		assert.ok(tier.tag);
		assert.ok(tier.sub);
		assert.ok(tier.name);
	}
});

test('languageMonogram uses stable abbreviations', () => {
	assert.equal(languageMonogram({ id: 'rust', name: 'Rust' }), 'RS');
	assert.equal(languageMonogram({ id: 'typescript', name: 'TypeScript' }), 'TS');
	assert.equal(languageMonogram({ id: 'python', name: 'Python' }), 'PY');
	assert.equal(languageMonogram({ id: 'lua', name: 'LuaJIT' }), 'LJ');
	assert.equal(languageMonogram({ id: 'go', name: 'Go' }), 'GO');
	assert.equal(languageMonogram({ id: 'cpp', name: 'C++' }), 'C++');
});

test('formatBenchmarkLabel normalizes hyphens and underscores', () => {
	assert.equal(formatBenchmarkLabel('overall'), 'ARENA');
	assert.equal(formatBenchmarkLabel('shortest-path'), 'SHORTEST PATH');
	assert.equal(formatBenchmarkLabel('barrier_wave'), 'BARRIER WAVE');
	assert.equal(formatBenchmarkLabel('barrier-wave'), 'BARRIER WAVE');
});
