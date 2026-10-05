export type TierLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ScoreTier = {
	/** Band label shown on the tier strip (e.g. SUPERSTAR). */
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
	java: 'JV',
	javascript: 'JS',
	typescript: 'TS',
	python: 'PY',
	lua: 'LJ',
	luajit: 'LJ',
	'lua-interpreted': 'L5',
	'c-sharp': 'C#',
	'c++': 'C++',
	cpp: 'C++',
	c: 'C',
	cplusplus: 'C++'
};

export function getScoreTier(score: number | null): ScoreTier {
	if (score === null) return UNRANKED;
	// Hoop Rush OVR bands: cut points double as the adjustment mechanism —
	// to rebalance rarity, move a `min` below. Target pool shares in comments.
	if (score >= 97) {
		// Historic / GOAT — target 0.5–1% of player pool
		return {
			name: 'HISTORIC',
			sub: 'Dark Matter',
			tag: 'DM',
			class: 'dark-matter',
			gradient: 'linear-gradient(135deg, #0a0612 0%, #1a0f3d 35%, #00d4ff 70%, #7b2fff 100%)',
			glow: '#00e5ff',
			tierLevel: 10
		};
	}
	if (score >= 94) {
		// MVP — target 1–2%
		return {
			name: 'MVP',
			sub: 'Prismatic Opal',
			tag: 'PO',
			class: 'prismatic-opal',
			gradient: 'linear-gradient(135deg, #ff6ec7 0%, #7afcff 35%, #ffe66d 65%, #b388ff 100%)',
			glow: '#e8c4ff',
			tierLevel: 9
		};
	}
	if (score >= 90) {
		// Superstar — target 3–5%
		return {
			name: 'SUPERSTAR',
			sub: 'Galaxy Opal',
			tag: 'GO',
			class: 'galaxy-opal',
			gradient: 'linear-gradient(135deg, #ff2bd6 0%, #b13bd6 45%, #6a1bd6 100%)',
			glow: '#ff2bd6',
			tierLevel: 8
		};
	}
	if (score >= 86) {
		// Star — target 6–10%
		return {
			name: 'STAR',
			sub: 'Pink Diamond',
			tag: 'PD',
			class: 'pink-diamond',
			gradient: 'linear-gradient(135deg, #ff6db5 0%, #d6388a 50%, #6a1d4f 100%)',
			glow: '#ff5fa8',
			tierLevel: 7
		};
	}
	if (score >= 82) {
		// High-end starter — target 12–16%
		return {
			name: 'KEY STARTER',
			sub: 'Diamond',
			tag: 'DIA',
			class: 'diamond',
			gradient: 'linear-gradient(135deg, #5ce6ff 0%, #2d9fd6 50%, #103a5e 100%)',
			glow: '#5ce6ff',
			tierLevel: 6
		};
	}
	if (score >= 78) {
		// Starter — target 18–22%
		return {
			name: 'STARTER',
			sub: 'Amethyst',
			tag: 'AME',
			class: 'amethyst',
			gradient: 'linear-gradient(135deg, #b794ff 0%, #7a4ed6 50%, #2a1850 100%)',
			glow: '#b794ff',
			tierLevel: 5
		};
	}
	if (score >= 74) {
		// Rotation — target 20–25%
		return {
			name: 'ROTATION',
			sub: 'Ruby',
			tag: 'RUB',
			class: 'ruby',
			gradient: 'linear-gradient(135deg, #ff5a5a 0%, #b32d2d 50%, #4a0e0e 100%)',
			glow: '#ff5a5a',
			tierLevel: 4
		};
	}
	if (score >= 70) {
		// Bench — target 12–18%
		return {
			name: 'BENCH',
			sub: 'Sapphire',
			tag: 'SAP',
			class: 'sapphire',
			gradient: 'linear-gradient(135deg, #6a8cff 0%, #2d4fb8 50%, #0e1a4a 100%)',
			glow: '#6a8cff',
			tierLevel: 3
		};
	}
	if (score >= 65) {
		// Fringe — target 5–10%
		return {
			name: 'FRINGE',
			sub: 'Turquoise',
			tag: 'TUR',
			class: 'turquoise',
			gradient: 'linear-gradient(135deg, #4fd8c8 0%, #2d8f86 50%, #0e3a36 100%)',
			glow: '#4fd8c8',
			tierLevel: 2
		};
	}
	// Replacement — target 1–5%
	return {
		name: 'REPLACEMENT',
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
