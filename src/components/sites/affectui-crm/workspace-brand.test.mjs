import assert from 'node:assert/strict';
import test from 'node:test';
import { logioContent, profileContent } from './workspace-brand.ts';

test('legacy display data is rebranded without changing IDs, assets or unrelated data', () => {
  const original = {
    id: 'acme', workspaceId: 'acme', name: 'Acme Studio',
    email: 'billing@acme.com', logo: '/uploads/Acme.png',
    tools: [{ args: { to: 'maya@acme.com' }, summary: 'Sent to maya@acme.com' }],
    contacts: [{ id: 'contact-1', name: 'Alex Morgan', email: 'alex@elsewhere.com' }],
    count: 5, active: true, value: null,
  };
  const updated = logioContent(original);
  assert.equal(updated.name, 'Damenci Studio');
  assert.equal(updated.email, 'billing@damenci.com');
  assert.equal(updated.tools[0].args.to, 'maya@damenci.com');
  assert.equal(updated.tools[0].summary, 'Sent to maya@damenci.com');
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

test('saved workspace names migrate from both demo brands without changing their IDs', () => {
  const personal = { id: 'personal', name: 'Personal' };
  for (const name of ['Acme', 'Logio']) {
    const updated = logioContent([{ id: 'acme', name }, personal]);
    assert.deepEqual(updated[0], { id: 'acme', name: 'Damenci' });
    assert.strictEqual(updated[1], personal);
    assert.strictEqual(logioContent(updated), updated);
  }
});

test('the demo account becomes Damenci while custom account values and avatars stay intact', () => {
  for (const domain of ['acme', 'logio']) {
    const original = { name: 'Alex Morgan', email: `alex@${domain}.com`, role: 'Head of Sales', avatar: '/uploads/Logio.png' };
    const updated = profileContent(original);
    assert.deepEqual(updated, { ...original, name: 'Damenci', email: 'damenci@damenci.com' });
    assert.equal(original.name, 'Alex Morgan');
    assert.strictEqual(profileContent(updated), updated);
  }
  const custom = { name: 'Minh', email: 'minh@example.com' };
  assert.strictEqual(profileContent(custom), custom);
});
