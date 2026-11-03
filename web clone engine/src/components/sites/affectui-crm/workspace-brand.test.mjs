import assert from 'node:assert/strict';
import test from 'node:test';
import { logioContent } from './workspace-brand.ts';

test('legacy display data is rebranded without changing IDs, assets or unrelated data', () => {
  const original = {
    id: 'acme', workspaceId: 'acme', name: 'Acme Studio',
    email: 'billing@acme.com', logo: '/uploads/Acme.png',
    tools: [{ args: { to: 'maya@acme.com' }, summary: 'Sent to maya@acme.com' }],
    contacts: [{ id: 'contact-1', name: 'Alex Morgan', email: 'alex@elsewhere.com' }],
    count: 5, active: true, value: null,
  };
  const updated = logioContent(original);
  assert.equal(updated.name, 'Logio Studio');
  assert.equal(updated.email, 'billing@logio.com');
  assert.equal(updated.tools[0].args.to, 'maya@logio.com');
  assert.equal(updated.tools[0].summary, 'Sent to maya@logio.com');
  assert.equal(updated.id, 'acme');
  assert.equal(updated.workspaceId, 'acme');
  assert.equal(updated.logo, original.logo);
  assert.strictEqual(updated.contacts, original.contacts);
  assert.equal(updated.count, 5);
  assert.equal(updated.active, true);
  assert.equal(updated.value, null);
  assert.equal(original.name, 'Acme Studio');
  assert.strictEqual(logioContent(updated), updated);
});
