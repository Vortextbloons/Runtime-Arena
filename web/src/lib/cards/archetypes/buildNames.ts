import type { CardAttribute } from '../types.ts';
import type { LanguageClassification } from '../types.ts';
import { ATTRIBUTE_PRIORITY } from '../types.ts';
import { coreAttributeSpread } from '../attributes/calculateAttributes.ts';

const ROLE_BY_ABBREVIATION: Record<string, string> = {
	CMP: 'Compute Specialist',
	DAT: 'Data Specialist',
	ALG: 'Algorithm Specialist',
	SCL: 'Large-Input Finisher',
	STA: 'Quick Starter',
	SPD: 'Quick Starter',
	CON: 'Consistent Performer'
};

const PREFIX_RULES: Array<{
	test: (classification: LanguageClassification, attributes: CardAttribute[]) => boolean;
	prefix: string;
}> = [
	{
		test: (c) => c.executionModels[0] === 'Native',
		prefix: 'Native'
	},
	{
		test: (c) => c.executionModels[0] === 'Managed',
		prefix: 'Managed'
	},
	{
		test: (c) => c.executionModels[0] === 'JIT',
		prefix: 'JIT'
	},
	{
		test: (c) => c.executionModels[0] === 'Interpreted',
		prefix: 'Interpreted'
	},
	{
		test: (c) => c.executionModels[0] === 'Bytecode' || c.executionModels[0] === 'Transpiled',
		prefix: 'Dynamic'
	},
	{
		test: (c) => c.roles[0] === 'Systems',
		prefix: 'Systems'
	},
	{
		test: (c) => c.roles[0] === 'Concurrent',
		prefix: 'Concurrent'
	},
	{
		test: (c, attributes) => {
			const bin = attributes.find((attribute) => attribute.abbreviation === 'BIN');
			return (bin?.available && (bin.rating ?? 0) >= 90) || c.roles[0] === 'Embedded';
		},
		prefix: 'Lightweight'
	}
];

function selectPrefix(classification: LanguageClassification, attributes: CardAttribute[]): string {
	for (const rule of PREFIX_RULES) {
		if (rule.test(classification, attributes)) return rule.prefix;
	}
	return 'Versatile';
}

function selectRole(attributes: CardAttribute[]): string {
	const spread = coreAttributeSpread(attributes);
	if (spread !== null && spread <= 5) return 'All-Around Performer';

	const candidates = attributes.filter(
		(attribute) =>
			attribute.available &&
			attribute.rating !== null &&
			ROLE_BY_ABBREVIATION[attribute.abbreviation] !== undefined
	);
	if (!candidates.length) return 'All-Around Performer';

	candidates.sort((a, b) => {
		const ratingDelta = (b.rating ?? 0) - (a.rating ?? 0);
		if (ratingDelta !== 0) return ratingDelta;
		return ATTRIBUTE_PRIORITY.indexOf(a.abbreviation as (typeof ATTRIBUTE_PRIORITY)[number]) -
			ATTRIBUTE_PRIORITY.indexOf(b.abbreviation as (typeof ATTRIBUTE_PRIORITY)[number]);
	});

	const winner = candidates[0]!;
	if (winner.abbreviation === 'SPD') {
		const sta = attributes.find((attribute) => attribute.abbreviation === 'STA');
		if (sta?.available) return ROLE_BY_ABBREVIATION.STA!;
	}
	return ROLE_BY_ABBREVIATION[winner.abbreviation] ?? 'All-Around Performer';
}

export function generateBuildName(
	classification: LanguageClassification,
	attributes: CardAttribute[]
): string {
	return `${selectPrefix(classification, attributes)} ${selectRole(attributes)}`;
}
