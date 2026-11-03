import { recoverAddressText } from "./address-recovery.ts";
import { toAscii } from "./vn-text.ts";
import { knowledge, loadDataset } from "./geo-fixture.mjs";
const damage = t => [...t.normalize("NFC")].map(c => toAscii(c) !== c ? "?" : c).join("");
const { provinces, districts, wards } = loadDataset().admin.recorded;
const k = knowledge();
for (let i = 0; i < 40; i++) {
  const w = wards[(i * 131 + 7) % wards.length], d = districts[w[1]], p = provinces[d[1]];
  const t = `${w[0]}, ${d[0]}, ${p}`; if (damage(t) === t) continue;
  const r = recoverAddressText(damage(t), k, { policy: "FORCE_NO_QUESTION_MARK" });
  if (r.value !== toAscii(t)) console.log(JSON.stringify(damage(t)), "\n  want", toAscii(t), "\n  got ", r.value, r.segments.map(s => s.segment.class).join());
}
