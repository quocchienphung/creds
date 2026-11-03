// The recovery on single texts, and a small leakage-safe held-out check (the full measurement is scripts/geo/evaluate-geo.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverAddressText, UNCALIBRATED } from "./address-recovery.ts";
import { classifySegments } from "./address-classifier.ts";
import { GeoKnowledge } from "./geo-knowledge.ts";
import { foldKey, toAscii } from "./vn-text.ts";
import { knowledge, loadDataset } from "./geo-fixture.mjs";

const force = { policy: "FORCE_NO_QUESTION_MARK", calibration: UNCALIBRATED };
const damage = text => [...text.normalize("NFC")].map(ch => toAscii(ch) !== ch ? "?" : ch).join("");

test("a classified address comes back without marks and without ?, whatever its case", () => {
  const k = knowledge();
  for (const text of ["Ph??ng B?n Ngh?, Qu?n 1, Th?nh ph? H? Ch? Minh", "PH??NG B?N NGH?, QU?N 1, TH?NH PH? H? CH? MINH"]) {
    const result = recoverAddressText(text, k, force);
    assert.ok(result.changed && !result.value.includes("?"), result.value);
    assert.equal(result.value, text.startsWith("PH") ? "PHUONG BEN NGHE, QUAN 1, THANH PHO HO CHI MINH" : "Phuong Ben Nghe, Quan 1, Thanh pho Ho Chi Minh");
  }
});

test("a number with a ? inside is an anchor: it is never changed and is recorded as such", () => {
  const result = recoverAddressText("S? nh? 12?3, Ph??ng B?n Ngh?, Qu?n 1", knowledge(), force);
  assert.ok(result.value.includes("12?3"));
  assert.ok(result.segments.flatMap(segment => segment.tokens).some(token => token.status === "rejected_numeric_anchor_conflict" && token.original === "12?3"));
});

test("a ? that is punctuation stays: a lone one ending the text, and one beside a whole syllable no syllable extends", () => {
  const k = knowledge();
  const lone = recoverAddressText("Ph??ng B?n Ngh?, Qu?n 1 ?", k, force);
  assert.ok(lone.value.endsWith(" ?"), lone.value);
  const question = recoverAddressText("Ban co dong y khong?", k, force);
  assert.equal(question.value, "Ban co dong y khong?");
});

test("SAFE_AUTO writes only what is trusted and leaves the rest as ?, FORCE writes a choice for all and says which were guesses", () => {
  const k = knowledge(), text = "Ph??ng ?? ??ng, Qu?n Hai B? Tr?ng, Th?nh ph? H? N?i";
  const safe = recoverAddressText(text, k, { policy: "SAFE_AUTO", calibration: { ...UNCALIBRATED, highMargin: 1e9, contextMargin: 1e9 } });
  const forced = recoverAddressText(text, k, force);
  assert.ok(safe.remainingPlaceholders > 0 && safe.value.includes("?"), safe.value);
  assert.ok(!forced.value.includes("?"), forced.value);
  assert.ok(forced.segments.flatMap(segment => segment.tokens).every(token => token.status !== "needs_review"));
  assert.ok(forced.segments.flatMap(segment => segment.tokens).some(token => token.status === "forced_guess" || token.status === "verified_official"));
});

test("text that is not an address is left to the generic repair", () => {
  const k = knowledge();
  assert.ok(classifySegments("MA?2024", k).every(segment => segment.class === "NON_ADDRESS_TEXT"));
  assert.equal(recoverAddressText("MA?2024", k, force).changed, false);
});

test("held out: addresses of wards the knowledge never saw are recovered with no ? left and most words right", () => {
  const data = loadDataset(), held = new Set(data.admin.recorded.wards.map((_, i) => i).filter(i => i % 10 === 3));
  const test = data.streets.filter(([, ward]) => held.has(ward)), folds = new Set(test.map(([name]) => foldKey(name)));
  const k = new GeoKnowledge({ ...data, streets: data.streets.filter(([, ward]) => !held.has(ward)), osm: { ...data.osm, names: data.osm.names.filter(([name]) => !folds.has(foldKey(name))) } });
  const { provinces, districts, wards } = data.admin.recorded;
  let words = 0, right = 0, left = 0, cells = 0;
  for (let i = 0; i < 60; i++) {
    const [name, w] = test[(i * 997 + 13) % test.length], ward = wards[w], district = districts[ward[1]], province = provinces[district[1]];
    const original = [name, ward[0], district[0], province].join(", "), text = damage(original), truth = toAscii(original);
    if (text === original) continue;
    cells++;
    const result = recoverAddressText(text, k, force);
    left += (result.value.match(/\?/g) ?? []).length;
    for (const token of result.segments.flatMap(segment => segment.tokens)) { words++; if (token.ascii.toLowerCase() === truth.slice(token.start, token.end).toLowerCase()) right++; }
    assert.equal(result.value.length, truth.length, "the text keeps its length and layout");
  }
  assert.ok(cells >= 50);
  assert.equal(left, 0);
  assert.ok(right / words >= 0.9, `${right}/${words} words`);
});
