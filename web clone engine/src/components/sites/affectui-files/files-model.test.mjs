import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFileLibrary, seedFileLibrary, safeFileUrl, fileKind } from './files-model.ts';

test('library validates persisted/backend records, unique ids, formats and download URLs', () => {
  const sample = seedFileLibrary('acme'); assert.equal(parseFileLibrary(sample), sample);
  assert.equal(sample.items.filter(f => f.folder === 'Brand assets').length, 3);
  assert.equal(sample.items.filter(f => f.template).length, 4);
  assert.equal(seedFileLibrary('personal').items.length, 0);
  const bad = changes => ({ ...sample, items: [{ ...sample.items[0], ...changes }] });
  for (const changes of [{ size: -1 }, { size: 1.5 }, { kind: '__proto__' }, { url: 'javascript:alert(1)' }, { url: '//outside.example/a' }, { url: 'https://user:secret@outside.example/a' }, { createdAt: 'bad' }, { mine: 'yes' }, { text: 42 }]) assert.equal(parseFileLibrary(bad(changes)), undefined);
  assert.equal(parseFileLibrary({ ...sample, items: [sample.items[0], sample.items[0]] }), undefined);
  assert.equal(parseFileLibrary({ items: [], folderAccess: { Research: 'public' } }), undefined);
});
test('safe URL and upload file kind detection do not execute untrusted content', () => {
  assert(safeFileUrl('/files/signed?id=123')); assert(safeFileUrl('https://storage.example/a.pdf'));
  for (const url of ['data:text/html,x', '/\\outside.example/a', 'file:///private/file', 'blob:untrusted', '//outside.example/a', 'https://x.test/\nfoo']) assert.equal(safeFileUrl(url), false);
  assert.equal(fileKind('Budget.XLSX', ''), 'spreadsheet'); assert.equal(fileKind('report.pdf', ''), 'pdf'); assert.equal(fileKind('notes.txt', 'text/plain'), 'document'); assert.equal(fileKind('picture', 'image/png'), 'image');
});
