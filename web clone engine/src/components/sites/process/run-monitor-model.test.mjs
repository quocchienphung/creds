import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankProcess, createNode } from './process-model.ts';
import { incomingBlocks, monitorElapsed, monitorSteps } from './run-monitor-model.ts';

const child = id => createNode({ id, name: id });
function fixture() {
  const doc = createBlankProcess();
  doc.root = createNode({ id: 'root', mode: 'sequence', children: [child('a'), child('b'), child('c')] });
  doc.links = [{ id: 'wait', from: 'a', to: 'c' }];
  return doc;
}

test('Routes use tree and wait dependencies, keeping parallel siblings separate', () => {
  const doc = fixture();
  assert.deepEqual(incomingBlocks(doc, 'b').map(node => node.id), ['a']);
  assert.deepEqual(incomingBlocks(doc, 'c').map(node => node.id), ['a', 'b']);
  doc.root.mode = 'parallel';
  assert.deepEqual(incomingBlocks(doc, 'b').map(node => node.id), ['root']);
  assert.deepEqual(incomingBlocks(doc, 'c').map(node => node.id), ['root', 'a']);
  assert.deepEqual(incomingBlocks(doc, 'root'), []);
});

test('Only observed steps stream in, preserving earlier rounds, failures and reported calls', () => {
  const doc = fixture();
  const call = { id: 'tool', kind: 'tool', name: 'Read', status: 'done', start: 20, end: 30, input: 'a.ts', output: 'real output' };
  const run = { status: 'running', cost: 1, started: 100, round: 2, rounds: [{ round: 1, status: 'done', cost: 1, started: 10, ended: 50, calls: [call] }], attempts: [{ cost: .1, started: 70, ended: 80, error: 'failed' }] };
  const snapshot = { id: 'run', processId: doc.id, startedAt: 0, at: 200, state: 'running', nodes: { a: run, b: { status: 'waiting', cost: 0, started: 60 }, c: { status: 'queued', cost: 0 } } };
  const steps = monitorSteps(doc, snapshot);
  assert.deepEqual(steps.map(step => step.id), ['a:1', 'b:1', 'a:2']);
  assert.equal(steps[0].run.calls[0], call);
  assert.equal(steps[2].run.attempts.length, 1);
  assert.equal(steps[2].current, true);
  assert.equal(steps[0].current, false);
  assert.deepEqual(monitorSteps(doc, null), []);
});

test('The ended clock freezes at the reported end and partial runs do not invent rows', () => {
  const doc = fixture();
  const snapshot = { id: 'run', processId: doc.id, startedAt: 100, at: 5000, state: 'done', nodes: { b: { status: 'done', cost: 0, started: 100, ended: 800 } } };
  assert.equal(monitorElapsed(snapshot), 700);
  assert.deepEqual(monitorSteps(doc, snapshot).map(step => step.node.id), ['b']);
  assert.equal(monitorElapsed({ ...snapshot, state: 'running' }), 4900);
});

test('Later loop rounds show the back edge rather than claiming a new Start', () => {
  const doc = fixture(); doc.links = [{ id: 'loop', from: 'c', to: 'root', rounds: 2 }];
  const snapshot = { id: 'run', processId: doc.id, startedAt: 0, at: 200, state: 'running', nodes: { root: { status: 'running', cost: 0, started: 100, round: 2, rounds: [{ round: 1, status: 'done', cost: 0, started: 0, ended: 50 }] } } };
  const steps = monitorSteps(doc, snapshot);
  assert.deepEqual(steps[0].from, []);
  assert.deepEqual(steps[1].from.map(node => node.id), ['c']);
});
