import assert from 'node:assert/strict';
import test from 'node:test';
import { countLogicalLines } from './count-implementation-loc.mjs';

test('countLogicalLines ignores blank and comment-only lines', () => {
	const source = `
// header
const x = 1;
/* block
   comment */
const y = 2; // tail
`;
	assert.equal(countLogicalLines(source, 'c'), 2);
});

test('countLogicalLines supports hash comments', () => {
	const source = `
# setup
print("ok")
`;
	assert.equal(countLogicalLines(source, 'hash'), 1);
});
