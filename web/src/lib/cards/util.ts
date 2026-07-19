import type { CardTier } from './types.ts';
import { CARD_TIER_BANDS } from './types.ts';

export const clampScore = (value: number) => Math.max(0, Math.min(100, value));

export const normalizeScore = (value: number) => Math.round(clampScore(value) * 1e9) / 1e9;

export function average(values: number[]): number {
	if (!values.length) return 0;
	return values.reduce((total, value) => total + value, 0) / values.length;
}

export function cardTierFromOverall(overall: number | null): CardTier | null {
	if (overall === null || !Number.isFinite(overall)) return null;
	for (const band of CARD_TIER_BANDS) {
		if (overall >= band.min) return band.tier;
	}
	return 'd';
}

export function cardTierLabel(tier: CardTier | null): string {
	if (!tier) return 'Unranked';
	const labels: Record<CardTier, string> = {
		's-plus': 'S+',
		s: 'S',
		'a-plus': 'A+',
		a: 'A',
		b: 'B',
		c: 'C',
		d: 'D'
	};
	return labels[tier];
}

/**
 * Percentile where 100 is best.
 * betterCount = languages strictly worse; tiedCount = other languages with the same value.
 * Divides by fieldSize - 1 so a unique first place scores 100.
 */
export function percentileRank(value: number, field: number[]): number {
	if (field.length <= 1) return 100;
	let betterCount = 0;
	let tiedCount = 0;
	for (const other of field) {
		if (other < value) betterCount += 1;
		else if (other === value) tiedCount += 1;
	}
	tiedCount = Math.max(0, tiedCount - 1);
	return normalizeScore((100 * (betterCount + 0.5 * tiedCount)) / (field.length - 1));
}

export function competitionRank(score: number, field: number[]): number {
	// Standard competition ranking: 1 + number of strictly better scores
	return 1 + field.filter((other) => other > score).length;
}
