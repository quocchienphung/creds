import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { translate } from '../i18n/translate.ts';
import { orchestratorCopy, runAnnouncement, timelineSpanName } from './orchestrator-copy.ts';
import { SAMPLE, RunSimulation, emptyRun, applyEvent, liveLog } from './orchestrator-model.ts';
import { callsFromRun, titleOf } from './tool-call-model.ts';
import { timelineFromEvents, normalize, spanName, KIND_LABEL } from './timeline-model.ts';

// The authored catalog only; no React, browser, external service or translation approximation.
function load(file) {
  const compiled = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', 'require', code)(compiled, compiled.exports, name => load(path.resolve(path.dirname(file), `${name}.ts`)));
  return compiled.exports;
}
const { vi } = load(path.resolve('src/components/sites/i18n/vi.ts'));
const en = orchestratorCopy((message, values) => translate(message, 'en', values, vi));
const vietnamese = orchestratorCopy((message, values) => translate(message, 'vi', values, vi));

test('all static Orchestrator UI messages have an authored translation', () => {
  const required = new Set(['Planned', 'Starting', 'Queued', 'Waiting', 'Files', 'Input', 'Output', 'Hide', 'Show', 'Copy input', 'Copy output', 'Needs approval', 'Allow', 'Deny', '6 results', '4 results', '5 results', '7 results']);
  for (const label of Object.values(KIND_LABEL)) required.add(label);
  for (const name of ['Orchestrator.tsx', 'OrchestratorBlock.tsx', 'AgentTimeline.tsx', 'ToolCall.tsx', 'orchestrator-copy.ts']) {
    const ast = ts.createSourceFile(name, fs.readFileSync(`src/components/sites/orchestrator/${name}`, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function literals(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { if (/[a-z]{2}/i.test(node.text)) required.add(node.text.trim()); }
      else if (ts.isConditionalExpression(node)) { literals(node.whenTrue); literals(node.whenFalse); }
      else if (!ts.isCallExpression(node)) ts.forEachChild(node, literals);
    }
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 't' && node.arguments[0]) literals(node.arguments[0]);
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'put' && node.arguments[1]) literals(node.arguments[1]);
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  const missing = [...required].filter(key => !Object.hasOwn(vi, key));
  assert.deepEqual(missing, []);
});

test('English stays byte-for-byte original; all sample run/transcript/tool/timeline copy translates without mutating the engine', () => {
  const original = JSON.stringify(SAMPLE), events = new RunSimulation(SAMPLE, 4).runToEnd(), strings = new Set();
  let view = emptyRun(); const soFar = [];
  const add = text => { if (text) strings.add(text); };
  add(SAMPLE.goal); SAMPLE.summary.chunks.forEach(add); SAMPLE.summary.bullets.forEach(add);
  for (const lane of SAMPLE.lanes) { add(lane.title); add(lane.instruction); add(lane.result); for (const step of lane.steps) { add(step.line); add(step.label); add(step.detail); } }
  for (const event of events) {
    soFar.push(event); view = applyEvent(view, event);
    assert.equal(runAnnouncement(view, en), view.announce);
    if (view.announce) assert.notEqual(runAnnouncement(view, vietnamese), view.announce);
    view.lanes.forEach((lane, index) => {
      add(lane.line);
      for (const row of liveLog(SAMPLE, index, lane)) { add(row.title); add(row.detail); }
    });
    for (const call of callsFromRun(soFar, view)) {
      const original = JSON.stringify(call);
      add(call.title); add(titleOf(call)); add(call.summary); add(call.message);
      if (call.output?.type === 'text') add(call.output.text);
      if (call.output?.type === 'list') for (const item of call.output.items) { add(item.title); add(item.tag); }
      assert.equal(JSON.stringify(call), original);
    }
  }
  const model = normalize(timelineFromEvents(events));
  for (const span of model.spans) {
    add(span.label); add(span.retry); add(span.detail);
    assert.equal(timelineSpanName(span, model, en), spanName(span, model));
    assert.notEqual(timelineSpanName(span, model, vietnamese), spanName(span, model));
  }
  for (const text of strings) assert.equal(en(text), text, `English: ${text}`);
  assert.deepEqual([...strings].filter(text => vietnamese(text) === text), [], 'sample copy missing Vietnamese');
  assert.equal(JSON.stringify(SAMPLE), original);
  for (const data of ['docs/pricing.md', '#pricing-review', 'notewise pricing per seat 2026', 'A future custom response.']) assert.equal(vietnamese(data), data);
});
