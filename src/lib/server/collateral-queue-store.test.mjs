import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deleteQueueUpload, downloadQueueUpload, listQueueUploads, QUEUE_UNDO_MS, QUEUE_UPLOAD_LIMIT, removeQueueUpload, restoreQueueUpload, saveQueueUpload, sweepExpiredQueueUploads, updateQueueUpload } from './collateral-queue-store.ts';
import { collateralQueueApi } from './collateral-queue-api.ts';

let root;
const prior = process.env.LOGIO_DATA_DIR;
const bytes = Buffer.from('Synthetic workbook upload bytes; the browser worker owns parsing.');
const sha = createHash('sha256').update(bytes).digest('hex');
const chunks = async function* (source = bytes) { yield source.subarray(0, 13); yield source.subarray(13); };
const folder = (workspace, id) => path.join(root, 'workspaces', workspace, 'collateral-queue', id);
before(async () => { root = await mkdtemp(path.join(tmpdir(), 'logio-collateral-queue-')); process.env.LOGIO_DATA_DIR = root; });
after(async () => {
  const resolved = path.resolve(root), relative = path.relative(path.resolve(tmpdir()), resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  assert.ok(path.basename(resolved).startsWith('logio-collateral-queue-'));
  await rm(resolved, { recursive: true, force: true });
  if (prior === undefined) delete process.env.LOGIO_DATA_DIR; else process.env.LOGIO_DATA_DIR = prior;
});

test('queue persists originals and metadata with a server-derived hash, size and timestamp', async () => {
  const entry = await saveQueueUpload('persist', 'Synthetic workbook.xlsx', chunks());
  assert.equal(entry.name, 'Synthetic workbook.xlsx');
  assert.equal(entry.size, bytes.length);
  assert.equal(entry.sha256, sha);
  assert.equal(entry.status, 'uploaded');
  assert.ok(Number.isFinite(Date.parse(entry.uploadedAt)));
  assert.deepEqual(JSON.parse(await readFile(path.join(folder('persist', entry.id), 'metadata.json'), 'utf8')), entry);
  assert.deepEqual(await readFile(path.join(folder('persist', entry.id), 'original.xlsx')), bytes);
  assert.deepEqual((await downloadQueueUpload('persist', entry.id)).bytes, bytes);
  assert.deepEqual(await listQueueUploads('persist'), [entry]);
});

test('each upload remains in history, including the same bytes uploaded twice', async () => {
  const first = await saveQueueUpload('history', 'same.xlsx', chunks());
  const second = await saveQueueUpload('history', 'same.xlsx', chunks());
  assert.notEqual(first.id, second.id);
  assert.equal((await listQueueUploads('history')).length, 2);
  assert.deepEqual(new Set((await listQueueUploads('history')).map(item => item.sha256)), new Set([sha]));
});

test('worker status changes persist without changing original identity or bytes', async () => {
  const entry = await saveQueueUpload('status', 'corrupt-but-retained.xlsx', chunks());
  const failed = await updateQueueUpload('status', entry.id, { status: 'failed', error: 'The workbook could not be opened.' });
  assert.equal(failed.error, 'The workbook could not be opened.');
  const ready = await updateQueueUpload('status', entry.id, { status: 'ready', sheets: 2, rows: 37 });
  assert.equal(ready.error, undefined);
  assert.equal(ready.sheets, 2);
  assert.equal(ready.rows, 37);
  assert.equal(ready.sha256, entry.sha256);
  assert.equal(ready.uploadedAt, entry.uploadedAt);
  assert.deepEqual((await downloadQueueUpload('status', entry.id)).bytes, bytes);
  await assert.rejects(updateQueueUpload('status', entry.id, { status: 'done' }), error => error.status === 400);
});

test('delete removes both disk files and the history entry; missing ids return 404', async () => {
  const entry = await saveQueueUpload('delete', 'remove.xlsx', chunks());
  await removeQueueUpload('delete', entry.id);
  await assert.rejects(access(folder('delete', entry.id)));
  assert.deepEqual(await listQueueUploads('delete'), []);
  await assert.rejects(downloadQueueUpload('delete', entry.id), error => error.status === 404);
  await assert.rejects(removeQueueUpload('delete', entry.id), error => error.status === 404);
});

test('workspace and uuid validation prevent cross-workspace access and path traversal', async () => {
  const entry = await saveQueueUpload('isolated', 'private.xlsx', chunks());
  assert.deepEqual(await listQueueUploads('other'), []);
  await assert.rejects(downloadQueueUpload('other', entry.id), error => error.status === 404);
  await assert.rejects(removeQueueUpload('other', entry.id), error => error.status === 404);
  for (const [workspace, id] of [['../escape', entry.id], ['isolated', '../escape'], ['isolated', 'a/b'], ['isolated', 'not-a-uuid']]) {
    await assert.rejects(downloadQueueUpload(workspace, id), error => error.status === 400);
    await assert.rejects(removeQueueUpload(workspace, id), error => error.status === 400);
  }
  await assert.rejects(saveQueueUpload('isolated', '../escape.xlsx', chunks()), error => error.status === 400);
  await assert.rejects(downloadQueueUpload('isolated', randomUUID()), error => error.status === 404);
  assert.deepEqual((await downloadQueueUpload('isolated', entry.id)).bytes, bytes);
});

test('concurrent uploads and serialized status/delete operations keep entries consistent', async () => {
  const entries = await Promise.all(Array.from({ length: 8 }, (_, index) => saveQueueUpload('concurrent', `${index}.xlsx`, chunks())));
  assert.equal((await listQueueUploads('concurrent')).length, 8);
  const entry = entries[0];
  const operations = await Promise.allSettled([
    updateQueueUpload('concurrent', entry.id, { status: 'ready', rows: 4, sheets: 1 }),
    removeQueueUpload('concurrent', entry.id),
    updateQueueUpload('concurrent', entry.id, { status: 'failed', error: 'late update' }),
  ]);
  assert.equal(operations[0].status, 'fulfilled');
  assert.equal(operations[1].status, 'fulfilled');
  assert.equal(operations[2].status, 'rejected');
  assert.equal(operations[2].reason.status, 404);
  assert.equal((await listQueueUploads('concurrent')).length, 7);
  await assert.rejects(access(folder('concurrent', entry.id)));
});

test('invalid, empty, oversized and interrupted streams never leave a queue entry or staging files', async () => {
  await assert.rejects(saveQueueUpload('limits', 'bad.csv', chunks()), error => error.status === 400);
  await assert.rejects(saveQueueUpload('limits', 'empty.xlsx', (async function* () {})()), error => error.status === 400);
  await assert.rejects(saveQueueUpload('limits', 'large.xlsx', (async function* () { yield new Uint8Array(QUEUE_UPLOAD_LIMIT + 1); })()), error => error.status === 413);
  await assert.rejects(saveQueueUpload('limits', 'interrupted.xlsx', (async function* () { yield bytes; throw new Error('Interrupted test stream'); })()), /Interrupted test stream/);
  assert.deepEqual(await listQueueUploads('limits'), []);
  assert.deepEqual(await readdir(path.join(root, 'workspaces', 'limits', 'collateral-queue')), []);
});

test('download integrity check catches damaged persisted original bytes', async () => {
  const entry = await saveQueueUpload('integrity', 'file.xlsx', chunks());
  await writeFile(path.join(folder('integrity', entry.id), 'original.xlsx'), 'changed');
  await assert.rejects(downloadQueueUpload('integrity', entry.id), error => error.status === 500);
  await removeQueueUpload('integrity', entry.id);
});

test('undo restores exactly the same entry and original within the eight-second window', async () => {
  const entry = await saveQueueUpload('undo', 'Keep original identity.xlsx', chunks());
  const now = Date.now(), receipt = await deleteQueueUpload('undo', entry.id, now);
  assert.equal(Date.parse(receipt.expiresAt), now + QUEUE_UNDO_MS);
  assert.match(receipt.undoToken, /^[a-f0-9]{64}$/);
  await assert.rejects(access(folder('undo', entry.id)));
  const trash = folder('undo', `.deleted-${entry.id}`);
  assert.deepEqual(await readFile(path.join(trash, 'original.xlsx')), bytes);
  assert.deepEqual(await listQueueUploads('undo'), []);
  await assert.rejects(downloadQueueUpload('undo', entry.id), error => error.status === 404);
  await assert.rejects(restoreQueueUpload('undo', entry.id, 'a'.repeat(64), now + 1000), error => error.status === 403);
  await assert.rejects(restoreQueueUpload('other', entry.id, receipt.undoToken, now + 1000), error => error.status === 410);
  const restored = await restoreQueueUpload('undo', entry.id, receipt.undoToken, now + 1000);
  assert.deepEqual(restored, entry);
  assert.deepEqual(await listQueueUploads('undo'), [entry]);
  assert.deepEqual((await downloadQueueUpload('undo', entry.id)).bytes, bytes);
  await assert.rejects(access(trash));
  await assert.rejects(access(path.join(folder('undo', entry.id), 'deletion.json')));
});

test('expired undo is refused and deletes bytes on disk without waiting in the test', async () => {
  const entry = await saveQueueUpload('expired', 'Expired.xlsx', chunks());
  const now = Date.now(), receipt = await deleteQueueUpload('expired', entry.id, now);
  await assert.rejects(restoreQueueUpload('expired', entry.id, receipt.undoToken, now + QUEUE_UNDO_MS), error => error.status === 410);
  await assert.rejects(access(folder('expired', `.deleted-${entry.id}`)));
  assert.deepEqual(await listQueueUploads('expired'), []);
});

test('durable tombstone sweep purges expired deletions and preserves live undo windows', async () => {
  const oldEntry = await saveQueueUpload('sweep', 'Old.xlsx', chunks());
  const liveEntry = await saveQueueUpload('sweep', 'Live.xlsx', chunks());
  const now = Date.now();
  await deleteQueueUpload('sweep', oldEntry.id, now);
  const live = await deleteQueueUpload('sweep', liveEntry.id, now + 10000);
  await sweepExpiredQueueUploads('sweep', now + QUEUE_UNDO_MS);
  await assert.rejects(access(folder('sweep', `.deleted-${oldEntry.id}`)));
  await access(folder('sweep', `.deleted-${liveEntry.id}`));
  assert.deepEqual(await restoreQueueUpload('sweep', liveEntry.id, live.undoToken, now + 10001), liveEntry);
});

test('concurrent delete/restore are serialized and tokens cannot restore another deletion', async () => {
  const entry = await saveQueueUpload('undo-races', 'Race.xlsx', chunks());
  const deletions = await Promise.allSettled([deleteQueueUpload('undo-races', entry.id), deleteQueueUpload('undo-races', entry.id)]);
  assert.equal(deletions[0].status, 'fulfilled');
  assert.equal(deletions[1].status, 'rejected');
  assert.equal(deletions[1].reason.status, 404);
  await restoreQueueUpload('undo-races', entry.id, deletions[0].value.undoToken);
  const second = await deleteQueueUpload('undo-races', entry.id);
  await assert.rejects(restoreQueueUpload('undo-races', entry.id, deletions[0].value.undoToken), error => error.status === 403);
  await restoreQueueUpload('undo-races', entry.id, second.undoToken);
});

test('corrupt deletion marker is an explicit error and does not silently purge bytes', async () => {
  const entry = await saveQueueUpload('bad-marker', 'Retain.xlsx', chunks());
  const now = Date.now(), receipt = await deleteQueueUpload('bad-marker', entry.id, now);
  const trash = folder('bad-marker', `.deleted-${entry.id}`);
  await writeFile(path.join(trash, 'deletion.json'), '{broken');
  await assert.rejects(sweepExpiredQueueUploads('bad-marker', now + QUEUE_UNDO_MS), error => error.status === 500);
  await assert.rejects(restoreQueueUpload('bad-marker', entry.id, receipt.undoToken), error => error.status === 500);
  assert.deepEqual(await readFile(path.join(trash, 'original.xlsx')), bytes);
});

test('HTTP contract covers encoded filenames, real attachments, list, patch and delete', async () => {
  const request = (method = 'GET', options = {}) => new Request('http://localhost/api/workspace/workspaces/http/collateral-queue', { method, ...options });
  const name = 'Báo cáo tháng 11.xlsx';
  const uploaded = await collateralQueueApi(request('POST', { headers: { 'x-file-name': encodeURIComponent(name), 'content-type': 'application/octet-stream' }, body: bytes }), 'http', []);
  assert.equal(uploaded.status, 201);
  const entry = (await uploaded.json()).data;
  assert.equal(entry.name, name);
  assert.equal(entry.sha256, sha);
  const listed = await collateralQueueApi(request(), 'http', []);
  assert.deepEqual((await listed.json()).data, [entry]);
  const patched = await collateralQueueApi(request('PATCH', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ready', rows: 20, sheets: 1, name: 'cannot-overwrite.xlsx' }) }), 'http', [entry.id]);
  assert.equal((await patched.json()).data.name, name);
  const downloaded = await collateralQueueApi(request(), 'http', [entry.id]);
  assert.match(downloaded.headers.get('content-disposition'), /^attachment;/);
  assert.ok(downloaded.headers.get('content-disposition').includes(encodeURIComponent(name)));
  assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(downloaded.headers.get('x-file-sha256'), sha);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  const malformed = await collateralQueueApi(request('POST', { headers: { 'x-file-name': '%' }, body: bytes }), 'http', []);
  assert.equal(malformed.status, 400);
  const tooLarge = await collateralQueueApi(request('POST', { headers: { 'x-file-name': 'large.xlsx', 'content-length': String(QUEUE_UPLOAD_LIMIT + 1) }, body: bytes }), 'http', []);
  assert.equal(tooLarge.status, 413);
  const invalidPatch = await collateralQueueApi(request('PATCH', { body: JSON.stringify({ status: 'ready', rows: -1 }) }), 'http', [entry.id]);
  assert.equal(invalidPatch.status, 400);
  const deleted = await collateralQueueApi(request('DELETE'), 'http', [entry.id]);
  assert.equal(deleted.status, 200);
  const receipt = (await deleted.json()).data;
  assert.match(receipt.undoToken, /^[a-f0-9]{64}$/);
  await assert.rejects(access(folder('http', entry.id)));
  assert.deepEqual((await (await collateralQueueApi(request(), 'http', [])).json()).data, []);
  const restored = await collateralQueueApi(request('POST', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ undoToken: receipt.undoToken }) }), 'http', [entry.id, 'restore']);
  assert.equal(restored.status, 200);
  const restoredEntry = (await restored.json()).data;
  assert.equal(restoredEntry.id, entry.id);
  assert.equal(restoredEntry.name, entry.name);
  assert.equal(restoredEntry.uploadedAt, entry.uploadedAt);
  assert.deepEqual((await downloadQueueUpload('http', entry.id)).bytes, bytes);
});
