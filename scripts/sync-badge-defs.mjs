#!/usr/bin/env node
/**
 * sync-badge-defs.mjs
 *
 * Reads shared/badge-definitions.json and generates:
 *   - web/src/lib/cards/shared.ts  (TypeScript imports for the web UI)
 *   - scripts/scorecard.mjs reads the JSON directly
 *
 * Usage: node scripts/sync-badge-defs.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SHARED_JSON = resolve(REPO_ROOT, 'shared', 'badge-definitions.json');
const WEB_SHARED_TS = resolve(REPO_ROOT, 'web', 'src', 'lib', 'cards', 'shared.ts');

const data = JSON.parse(readFileSync(SHARED_JSON, 'utf-8'));

function toTsObj(obj, indent = '\t') {
	const parts = [];
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'string') {
			parts.push(`${indent}${key}: '${value}'`);
		} else if (typeof value === 'boolean') {
			parts.push(`${indent}${key}: ${value}`);
		} else if (typeof value === 'number') {
			parts.push(`${indent}${key}: ${value}`);
		}
	}
	return parts.join(',\n');
}

function badgeToTs(badge) {
	const fields = [];
	fields.push(`\tid: '${badge.id}'`);
	fields.push(`\tname: '${badge.name}'`);
	fields.push(`\tcategory: '${badge.category}' as const`);
	fields.push(`\tsource: '${badge.source}' as const`);
	if (badge.benchmarkId) fields.push(`\tbenchmarkId: '${badge.benchmarkId}'`);
	if (badge.legendRequiresSizeSweep) fields.push(`\tlegendRequiresSizeSweep: true`);
	if (badge.legendRequiresCategoryWin) fields.push(`\tlegendRequiresCategoryWin: true`);
	if (badge.legendRequiresFirstOverall) fields.push(`\tlegendRequiresFirstOverall: true`);
	if (badge.legendRequiresFastestRaw) fields.push(`\tlegendRequiresFastestRaw: true`);
	if (badge.legendRequiresSmallestRaw) fields.push(`\tlegendRequiresSmallestRaw: true`);
	if (badge.legendRequiresLargestRaw) fields.push(`\tlegendRequiresLargestRaw: true`);
	return `{\n${fields.join(',\n')}\n}`;
}

function attrToTs(attr) {
	return `{ id: '${attr.id}', label: '${attr.label}', abbreviation: '${attr.abbreviation}', category: '${attr.category}' as const }`;
}

const ts = `/**
 * AUTO-GENERATED from shared/badge-definitions.json
 * Do not edit by hand — run \`node scripts/sync-badge-defs.mjs\` to regenerate.
 */
export const ALL_BADGE_DEFINITIONS = [
${data.badges.map(b => '\t' + badgeToTs(b)).join(',\n')}
];

export const ALL_ATTRIBUTE_DEFINITIONS = [
${data.attributeDefinitions.map(a => '\t' + attrToTs(a)).join(',\n')}
];

export const HYBRID_TIER_THRESHOLDS = [
${data.tierThresholds.map(t => `\t{ tier: '${t.tier}' as const, minimumScore: ${t.minimumScore}, minimumPercentile: ${t.minimumPercentile} }`).join(',\n')}
];

export const BADGE_OVR_BONUS: Record<string, number> = {
${Object.entries(data.badgeBonus).map(([k, v]) => `\t'${k}': ${v}`).join(',\n')}
};
`;

writeFileSync(WEB_SHARED_TS, ts, 'utf-8');
console.log(`Generated: ${WEB_SHARED_TS}`);
console.log(`  Badges: ${data.badges.length}`);
console.log(`  Attributes: ${data.attributeDefinitions.length}`);
