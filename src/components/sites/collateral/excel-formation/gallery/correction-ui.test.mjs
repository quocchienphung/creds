import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { VietnameseModel } from "../engine/predict.ts";
import { translate } from "../../../i18n/translate.ts";

const require = createRequire(import.meta.url), cache = new Map();
let locale = "en";
// Same local transpilation pattern as i18n/translate.test.mjs; only the app's locale/storage hook is replaced.
function load(url) {
  if (!/\.(?:tsx?|css)$/.test(url.pathname)) url = new URL(existsSync(new URL(`${url.href}.ts`)) ? `${url.href}.ts` : `${url.href}.tsx`);
  if (cache.has(url.href)) return cache.get(url.href).exports;
  const source = readFileSync(url, "utf8");
  if (url.pathname.endsWith(".css")) return {};
  const compiled = { exports: {} }; cache.set(url.href, compiled);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = specifier => {
    if (specifier === "@/components/sites/i18n/WorkspaceI18n") return { useWorkspaceI18n: () => ({ locale, t: (text, values) => translate(text, locale, values, credit) }) };
    return specifier.startsWith(".") ? load(new URL(specifier, url)) : require(specifier);
  };
  new Function("module", "exports", "require", code)(compiled, compiled.exports, localRequire);
  return compiled.exports;
}
const { credit } = load(new URL("../../../i18n/vi-credit.ts", import.meta.url));
const { SpeculativePanel } = load(new URL("./SpeculativePanel.tsx", import.meta.url));
const model = new VietnameseModel();
for (let i = 0; i < 8; i++) model.add("Ke hoach trien khai");
model.add("Hung Yen"); model.finish();
const text = "Ke ho?ch H?ng zz?zz";
const prediction = { text, predictions: model.predict(text), modelWords: model.size };
const unexpectedAction = () => assert.fail("Rendering suggestions must not choose or apply a correction");
const render = props => renderToStaticMarkup(createElement(SpeculativePanel, { prediction, loading: false, picks: {}, onPick: unexpectedAction, onUse: unexpectedAction, onRetry: unexpectedAction, ...props }));
const read = name => readFileSync(new URL(name, import.meta.url), "utf8");

test("Excel formation still reaches Suggested corrections through Review and fix", () => {
  assert.match(read("../ExcelFormation.tsx"), /step === "review" && <ReviewStep\b/);
  assert.match(read("../steps/ReviewStep.tsx"), /details=\{<IssueDetails\b/);
  assert.match(read("../IssueDetails.tsx"), /wantsPrediction && <SpeculativePanel\b/);
});

test("Suggested corrections renders Guess and check, both lanes and the original controls", () => {
  const html = render();
  for (const label of ["Suggested corrections", "Guess and check", "Draft", "Target", "Output", "Checks made", "Drafts accepted", "Words per check", "Draft length", "Compare with one word at a time", "Pause", "Restart"]) assert.ok(html.includes(label), label);
  assert.match(html, /type="range"[^>]*min="2"[^>]*max="8"/);
  assert.match(html, /role="switch"[^>]*aria-checked="false"/);
});

test("the actionable table and manual fallback stay beside the replay; uncertain words stay unchanged", () => {
  const html = render();
  for (const label of ["Replacement", "Evidence", "Keep original", "Type another word", "Use this reading", "Needs your review", "No match in this file", "2 words still need your choice", "Approve below to save the change."]) assert.ok(html.includes(label), label);
  assert.match(html, /data-unsure="true"[^>]*>H\?ng<\/span>/);
  assert.match(html, /data-unsure="true"[^>]*>zz\?zz<\/span>/);
  const rare = prediction.predictions.find(word => word.text === "H?ng");
  const unknown = prediction.predictions.find(word => word.text === "zz?zz");
  const chosen = render({ picks: { [rare.index]: "Hung", [unknown.index]: "custom" } });
  assert.ok(chosen.includes("Ready to copy into the final value"));
  assert.ok(chosen.includes("Entered manually"));
  assert.match(chosen, /data-origin="you"[^>]*>Hung<\/span>/);
  assert.match(chosen, /data-origin="you"[^>]*>custom<\/span>/);
  assert.ok(chosen.includes("Your choice"));
});

test("loading and predictor failure retain visible status and a retry/manual path", () => {
  assert.match(render({ prediction: null, loading: true }), /aria-busy="true"/);
  const failed = render({ prediction: null });
  assert.ok(failed.includes("You can still type the correction below."));
  assert.ok(failed.includes("Try again"));
  assert.equal(render({ prediction: { ...prediction, predictions: model.predict("Ke hoach") } }), "");
});

test("the Vietnamese workbench retains the same replay and review controls", () => {
  locale = "vi";
  try {
    const html = render();
    for (const label of ["Gợi ý sửa từ", "Đoán và kiểm tra", "Use this reading", "Keep original", "Draft length"]) assert.ok(html.includes(translate(label, "vi", undefined, credit)), label);
  } finally { locale = "en"; }
});
