import test from 'node:test';
import assert from 'node:assert/strict';
import { minute, taskGeometry, handoffPath, resolveWaiting, stateOfAgent, durationLabel } from './lanes-model.ts';

const span = 30 * minute;
const task = { id: 'r1', agentId: 'r', title: 'Research', status: 'done', start: -27 * minute, end: -16 * minute, handoffTo: 'w1' };
test('Finished blocks retain duration and slide left with the visible window', () => {
  const a = taskGeometry(task, 0, span), b = taskGeometry(task, 5 * minute, span);
  assert.equal(a.left, 10);
  assert.equal(a.width, 11 / 30 * 100);
  assert(b.left < 0);
  assert.equal(a.width, b.width);
});
test('Running blocks end at now while future, expired and invalid intervals are omitted', () => {
  const running = { ...task, status: 'running', end: undefined };
  const geometry = taskGeometry(running, 0, span);
  assert.equal(geometry.left + geometry.width, 100);
  assert.equal(taskGeometry(task, 20 * minute, span), null);
  assert.equal(taskGeometry({ ...running, start: minute }, 0, span), null);
  assert.equal(taskGeometry({ ...task, end: task.start - 1 }, 0, span), null);
  assert.equal(taskGeometry(task, 0, 0), null);
});
test('A handoff uses both task timestamps and the correct agent rows', () => {
  const next = { ...task, id: 'w1', agentId: 'w', start: -15 * minute, status: 'running', end: undefined };
  const path = handoffPath(task, next, ['r', 'w'], 0, span);
  assert(path.startsWith('M 466.6666666666667 24 C '));
  assert(path.endsWith('500 72'));
  assert.equal(handoffPath(task, next, ['r'], 0, span), null);
});
test('Waiting outranks running; completed/expired work leaves an idle agent', () => {
  const running = { ...task, id: 'r2', status: 'running', end: undefined };
  const waiting = { ...running, id: 'r3', status: 'waiting' };
  assert.equal(stateOfAgent('r', [task, running, waiting], 0, span), 'waiting');
  assert.equal(stateOfAgent('r', [task, running], 0, span), 'running');
  assert.equal(stateOfAgent('r', [task], 0, span), 'idle');
});
test('Approval resumes at the existing start; rejection freezes the end without mutating input', () => {
  const waiting = { ...task, status: 'waiting', end: undefined };
  const approved = resolveWaiting(waiting, true, minute), rejected = resolveWaiting(waiting, false, minute);
  assert.equal(approved.status, 'running');
  assert.equal(approved.start, waiting.start);
  assert.equal(approved.end, undefined);
  assert.equal(rejected.status, 'failed');
  assert.equal(rejected.end, minute);
  assert.equal(waiting.status, 'waiting');
  assert.equal(resolveWaiting(task, true, minute), task);
  assert.equal(durationLabel(rejected, 99 * minute), '28m');
});
