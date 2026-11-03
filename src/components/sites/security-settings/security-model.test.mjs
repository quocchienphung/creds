import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSecurityPreview, passwordIssue, passwordStrength } from './security-model.ts';

test('Preview metadata discards secrets, invalid dates and the current sample session', () => {
  assert.deepEqual(parseSecurityPreview({ twoFactor: true, revoked: ['mac', 'iphone', 'iphone', 'unknown'], password: 'never-store', secret: 'never-store', passwordChangedAt: 'bad' }), { twoFactor: true, revoked: ['iphone'] });
  assert.equal(parseSecurityPreview({ twoFactor: 'yes', revoked: [] }), undefined);
});

test('Password requirements match the observed 12 character, mixed case, number and symbol rules', () => {
  assert.match(passwordIssue('', 'ExamplePass!42'), /current/);
  assert.match(passwordIssue('old', 'Abc!12'), /12/);
  assert.match(passwordIssue('old', 'lowercase123456!'), /uppercase|upper and lower/i);
  assert.match(passwordIssue('old', 'LongPassword!'), /number/);
  assert.match(passwordIssue('old', 'LongPassword42'), /symbol/);
  assert.equal(passwordIssue('old', 'LongPassword!42'), undefined);
  assert.equal(passwordStrength('LongPassword!42'), 4);
  assert.equal(passwordStrength(''), 0);
});
