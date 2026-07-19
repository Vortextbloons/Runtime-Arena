import type { CardAttribute } from '../types.ts';
import { ATTRIBUTE_PRIORITY } from '../types.ts';
import { coreAttributeSpread } from '../attributes/calculateAttributes.ts';

const TAKEOVER_BY_ABBREVIATION: Record<string, string> = {
	CMP: 'Compute Dominance',
	ALG: 'Algorithm Control',
	DAT: 'Data Command',
	SPD: 'Speed Force',
	SCL: 'Scale Control',
	CON: 'Consistency Lock',
	STA: 'Startup Burst',
	MEM: 'Memory Control',
	IO: 'I/O Command',
	PAR: 'Parallel Force'
};

const V1_TAKEOVER_ABBREVIATIONS = new Set(['CMP', 'ALG', 'DAT', 'SPD', 'SCL', 'CON']);

export function calculatePrimaryTakeover(attributes: CardAttribute[]): string {
	const spread = coreAttributeSpread(attributes);
	if (spread !== null && spread <= 5) return 'All-Around';

	const candidates = attributes.filter(
		(attribute) =>
			attribute.available &&
			attribute.rating !== null &&
			V1_TAKEOVER_ABBREVIATIONS.has(attribute.abbreviation)
	);
	if (!candidates.length) return 'All-Around';

	candidates.sort((a, b) => {
		const ratingDelta = (b.rating ?? 0) - (a.rating ?? 0);
		if (ratingDelta !== 0) return ratingDelta;
		return ATTRIBUTE_PRIORITY.indexOf(a.abbreviation as (typeof ATTRIBUTE_PRIORITY)[number]) -
			ATTRIBUTE_PRIORITY.indexOf(b.abbreviation as (typeof ATTRIBUTE_PRIORITY)[number]);
	});

	return TAKEOVER_BY_ABBREVIATION[candidates[0]!.abbreviation] ?? 'All-Around';
}

export function calculateSecondaryTakeover(
	attributes: CardAttribute[],
	primary: string
): string | undefined {
	const eligible = attributes.filter(
		(attribute) =>
			attribute.available &&
			attribute.rating !== null &&
			TAKEOVER_BY_ABBREVIATION[attribute.abbreviation] !== undefined
	);
	if (eligible.length < 4) return undefined;

	eligible.sort((a, b) => {
		const ratingDelta = (b.rating ?? 0) - (a.rating ?? 0);
		if (ratingDelta !== 0) return ratingDelta;
		return ATTRIBUTE_PRIORITY.indexOf(a.abbreviation as (typeof ATTRIBUTE_PRIORITY)[number]) -
			ATTRIBUTE_PRIORITY.indexOf(b.abbreviation as (typeof ATTRIBUTE_PRIORITY)[number]);
	});

	const second = eligible[1];
	if (!second || (second.rating ?? 0) < 85) return undefined;
	const label = TAKEOVER_BY_ABBREVIATION[second.abbreviation];
	if (!label || label === primary) return undefined;
	return label;
}
