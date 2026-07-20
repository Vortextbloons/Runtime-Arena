import type { LanguageClassification } from './types.ts';

const CATALOG: Record<string, LanguageClassification> = {
	rust: {
		languageId: 'rust',
		executionModels: ['Native'],
		roles: ['Systems', 'Concurrent'],
		memoryModels: ['Ownership']
	},
	cpp: {
		languageId: 'cpp',
		executionModels: ['Native'],
		roles: ['Systems'],
		memoryModels: ['Manual Memory']
	},
	go: {
		languageId: 'go',
		executionModels: ['Native'],
		roles: ['Concurrent', 'Systems', 'Application'],
		memoryModels: ['Garbage Collected']
	},
	java: {
		languageId: 'java',
		executionModels: ['Bytecode', 'Managed'],
		roles: ['Application', 'Systems'],
		memoryModels: ['Garbage Collected']
	},
	typescript: {
		languageId: 'typescript',
		executionModels: ['Transpiled', 'Managed'],
		roles: ['Web', 'Application'],
		memoryModels: ['Garbage Collected']
	},
	javascript: {
		languageId: 'javascript',
		executionModels: ['JIT', 'Interpreted'],
		roles: ['Web', 'Scripting'],
		memoryModels: ['Garbage Collected']
	},
	python: {
		languageId: 'python',
		executionModels: ['Interpreted'],
		roles: ['Scripting', 'Data', 'Scientific'],
		memoryModels: ['Garbage Collected']
	},
	lua: {
		languageId: 'lua',
		executionModels: ['JIT', 'Interpreted'],
		roles: ['Scripting', 'Embedded'],
		memoryModels: ['Garbage Collected']
	},
	'lua-interpreted': {
		languageId: 'lua-interpreted',
		executionModels: ['Interpreted'],
		roles: ['Scripting', 'Embedded'],
		memoryModels: ['Garbage Collected']
	},
	'c-sharp': {
		languageId: 'c-sharp',
		executionModels: ['Managed', 'Bytecode'],
		roles: ['Application', 'Systems'],
		memoryModels: ['Garbage Collected']
	},
	c: {
		languageId: 'c',
		executionModels: ['Native'],
		roles: ['Systems'],
		memoryModels: ['Manual Memory']
	}
};

export function getLanguageClassification(languageId: string): LanguageClassification {
	return (
		CATALOG[languageId] ?? {
			languageId,
			executionModels: [],
			roles: [],
			memoryModels: []
		}
	);
}

export function displayClassifications(classification: LanguageClassification): string[] {
	const chips: string[] = [];
	const execution = classification.executionModels[0];
	const role = classification.roles[0];
	if (execution) chips.push(execution);
	if (role && role !== execution) chips.push(role);
	return chips;
}

/** Divisions a language belongs to based on classifications. */
export function divisionMemberships(classification: LanguageClassification): string[] {
	const memberships = new Set<string>();
	for (const model of classification.executionModels) {
		if (model === 'Native') memberships.add('Native');
		if (model === 'Managed') memberships.add('Managed');
		if (model === 'Interpreted') memberships.add('Interpreted');
		if (model === 'Bytecode' || model === 'Transpiled') memberships.add('Dynamic');
		if (model === 'JIT') memberships.add('Dynamic');
	}
	for (const role of classification.roles) {
		if (role === 'Systems') memberships.add('Systems');
		if (role === 'Scripting') memberships.add('Scripting');
	}
	return [...memberships];
}
