export type TierLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ScoreTier = {
	/** Band label shown on the tier strip (e.g. DOMINANT). */
	name: string;
	/** Gem / rarity label (e.g. Diamond). */
	sub: string;
	/** Short rarity tag (e.g. DIA). */
	tag: string;
	/** CSS modifier class (e.g. diamond). */
	class: string;
	gradient: string;
	glow: string;
	/** Visual rarity weight — not leaderboard placement. */
	tierLevel: TierLevel;
};

const UNRANKED: ScoreTier = {
	name: 'UNVERIFIED',
	sub: 'No Rank',
	tag: '—',
	class: 'unranked',
	gradient: 'linear-gradient(135deg, #4a5560 0%, #2a323a 50%, #0e141a 100%)',
	glow: '#4a5560',
	tierLevel: 0
};

const LANGUAGE_MONOGRAMS: Record<string, string> = {
	rust: 'RS',
	go: 'GO',
	typescript: 'TS',
	python: 'PY',
	lua: 'LJ',
	luajit: 'LJ',
	'c++': 'C++',
	cpp: 'C++',
	cplusplus: 'C++'
};

export function getScoreTier(score: number | null): ScoreTier {
	if (score === null) return UNRANKED;
	if (score >= 95) {
		return {
			name: 'UNTOUCHABLE',
			sub: 'Galaxy Opal',
			tag: 'GO',
			class: 'galaxy-opal',
			gradient: 'linear-gradient(135deg, #ff2bd6 0%, #b13bd6 45%, #6a1bd6 100%)',
			glow: '#ff2bd6',
			tierLevel: 7
		};
	}
	if (score >= 90) {
		return {
			name: 'INVINCIBLE',
			sub: 'Pink Diamond',
			tag: 'PD',
			class: 'pink-diamond',
			gradient: 'linear-gradient(135deg, #ff6db5 0%, #d6388a 50%, #6a1d4f 100%)',
			glow: '#ff5fa8',
			tierLevel: 6
		};
	}
	if (score >= 80) {
		return {
			name: 'DOMINANT',
			sub: 'Diamond',
			tag: 'DIA',
			class: 'diamond',
			gradient: 'linear-gradient(135deg, #5ce6ff 0%, #2d9fd6 50%, #103a5e 100%)',
			glow: '#5ce6ff',
			tierLevel: 5
		};
	}
	if (score >= 70) {
		return {
			name: 'ELITE',
			sub: 'Amethyst',
			tag: 'AME',
			class: 'amethyst',
			gradient: 'linear-gradient(135deg, #b794ff 0%, #7a4ed6 50%, #2a1850 100%)',
			glow: '#b794ff',
			tierLevel: 4
		};
	}
	if (score >= 60) {
		return {
			name: 'STANDARD',
			sub: 'Ruby',
			tag: 'RUB',
			class: 'ruby',
			gradient: 'linear-gradient(135deg, #ff5a5a 0%, #b32d2d 50%, #4a0e0e 100%)',
			glow: '#ff5a5a',
			tierLevel: 3
		};
	}
	if (score >= 45) {
		return {
			name: 'ROOKIE',
			sub: 'Sapphire',
			tag: 'SAP',
			class: 'sapphire',
			gradient: 'linear-gradient(135deg, #6a8cff 0%, #2d4fb8 50%, #0e1a4a 100%)',
			glow: '#6a8cff',
			tierLevel: 2
		};
	}
	return {
		name: 'COMMON',
		sub: 'Emerald',
		tag: 'EME',
		class: 'emerald',
		gradient: 'linear-gradient(135deg, #6affb8 0%, #2db87a 50%, #0e4a2a 100%)',
		glow: '#6affb8',
		tierLevel: 1
	};
}

/** Stable card monogram from language id (preferred) or display name. */
export function languageMonogram(language: { id: string; name: string }): string {
	const byId = LANGUAGE_MONOGRAMS[language.id.toLowerCase()];
	if (byId) return byId;
	const byName = LANGUAGE_MONOGRAMS[language.name.toLowerCase().replace(/\s+/g, '')];
	if (byName) return byName;
	if (/^c\+\+$/i.test(language.name.trim())) return 'C++';
	return (language.name[0] ?? language.id[0] ?? '?').toUpperCase();
}

/** Human-readable benchmark archetype label. */
export function formatBenchmarkLabel(benchmarkId: string): string {
	if (benchmarkId === 'overall') return 'ARENA';
	return benchmarkId.replace(/[-_]+/g, ' ').toUpperCase();
}
