import type { BenchmarkScore } from '../../types.ts';
import type { DivisionRank, LanguageClassification } from '../types.ts';
import { divisionMemberships } from '../classifications.ts';
import { competitionRank } from '../util.ts';

export const STARTER_DIVISIONS = [
	{ id: 'Native', name: 'Native' },
	{ id: 'Managed', name: 'Managed' },
	{ id: 'Interpreted', name: 'Interpreted' },
	{ id: 'Dynamic', name: 'Dynamic' },
	{ id: 'Systems', name: 'Systems' },
	{ id: 'Scripting', name: 'Scripting' }
] as const;

const MIN_DIVISION_FIELD = 3;

export type DivisionLanguage = {
	languageId: string;
	overall: number | null;
	classification: LanguageClassification;
};

export function calculateDivisionRanks(languages: DivisionLanguage[]): Map<string, DivisionRank[]> {
	const byLanguage = new Map<string, DivisionRank[]>();

	for (const division of STARTER_DIVISIONS) {
		const members = languages.filter(
			(language) =>
				language.overall !== null &&
				divisionMemberships(language.classification).includes(division.id)
		);
		if (members.length < MIN_DIVISION_FIELD) continue;

		const fieldScores = members.map((language) => language.overall!);
		for (const member of members) {
			const rank: DivisionRank = {
				divisionId: division.id,
				divisionName: division.name,
				rank: competitionRank(member.overall!, fieldScores),
				fieldSize: members.length,
				score: member.overall!
			};
			const list = byLanguage.get(member.languageId) ?? [];
			list.push(rank);
			byLanguage.set(member.languageId, list);
		}
	}

	return byLanguage;
}

export function selectFeaturedDivisionRank(ranks: DivisionRank[]): DivisionRank | undefined {
	if (!ranks.length) return undefined;
	return [...ranks].sort((a, b) => {
		if (a.rank !== b.rank) return a.rank - b.rank;
		if (a.fieldSize !== b.fieldSize) return b.fieldSize - a.fieldSize;
		return a.divisionName.localeCompare(b.divisionName);
	})[0];
}

/** Helper for callers that already have overall BenchmarkScore rows. */
export function divisionLanguagesFromScores(
	overallScores: BenchmarkScore[],
	classificationFor: (languageId: string) => LanguageClassification
): DivisionLanguage[] {
	return overallScores.map((score) => ({
		languageId: score.language.id,
		overall: score.eligible ? score.overall : null,
		classification: classificationFor(score.language.id)
	}));
}
