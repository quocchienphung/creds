import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url), cache = new Map();
// Transpile only the pure catalog modules. No app/browser runtime or network service is loaded.
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const compiled = { exports: {} }; cache.set(file, compiled);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = specifier => specifier.startsWith('.') ? load(path.resolve(path.dirname(file), `${specifier}.ts`)) : require(specifier);
  new Function('module', 'exports', 'require', code)(compiled, compiled.exports, localRequire);
  return compiled.exports;
}
const root = 'src/components/sites/i18n';
const { translate: translateWithDictionary } = load(`${root}/translate.ts`), { vi } = load(`${root}/vi.ts`);
const translate = (message, locale, values) => translateWithDictionary(message, locale, values, vi);
const { searchSettings, defaultSettings } = load('src/components/sites/settings-command/settings-model.ts');
test('English source, whitespace and React nodes retain their original values', () => {
  assert.equal(translate('  Home  ', 'en'), '  Home  ');
  const node = { type: 'span', props: { children: 'Home' } };
  assert.equal(translate(node, 'vi'), node);
  assert.equal(translate(120, 'vi'), 120);
});
test('Vietnamese is exact reviewed copy, without partial sentence replacement', () => {
  assert.equal(translate('  Home  ', 'vi'), '  Trang chủ  ');
  for (const text of ['Read this custom message and three more', 'A customer custom note from July to September.', 'constructor', '__proto__']) assert.equal(translate(text, 'vi'), text);
});
test('explicit interpolation preserves names, values, currency and placeholder order', () => {
  assert.equal(translate('Run {0}', 'en', ['Home']), 'Run Home');
  assert.equal(translate('Run {0}', 'vi', ['Home']), 'Chạy Home');
  assert.equal(translate('Revoke {0}', 'vi', ['Save']), 'Thu hồi phiên Save');
  assert.equal(translate(' (${0}/year)', 'vi', [588]), ' ($588/năm)');
  assert.equal(translate('Name, address, and regional defaults for {0}.', 'vi', ['Save']), 'Tên, địa chỉ và tùy chọn vùng cho Save.');
});
test('every translated placeholder exists in its English key', () => {
  assert.ok(Object.keys(vi).length > 2700);
  for (const [key, value] of Object.entries(vi)) {
    assert.ok(value.length, key);
    for (const field of value.match(/\{\d+\}/g) ?? []) assert.ok(key.includes(field), `${key}: unexpected ${field}`);
    assert.ok(!value.includes('\ufffd'), `${key}: invalid UTF-8`);
  }
});
test('both languages search the same stable settings IDs, including unaccented Vietnamese', () => {
  const t = text => translate(text, 'vi');
  assert.equal(defaultSettings('Logio').language, 'en');
  assert.ok(searchSettings('ngon ngu', t).some(hit => hit.row.id === 'language' && hit.row.label === 'Ngôn ngữ'));
  assert.ok(searchSettings('Language', t).some(hit => hit.row.id === 'language'));
  assert.ok(searchSettings('phien dang nhap', t).some(hit => hit.row.id === 'where-you-log'));
});
