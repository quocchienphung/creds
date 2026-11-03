import { __dbg, contextUnits } from "./address-recovery.ts";
import { knowledge } from "./geo-fixture.mjs";
const k = knowledge();
const seg = "X? Thanh Ph?";
const words = __dbg.wordsOf(seg, k);
const ctx = contextUnits("Xã Thanh Phố, Thị xã Bình Long, Tỉnh Bình Phước", k);
__dbg.applyGazetteer(words, k, ctx);
for (const w of words) { console.log(w.piece.text, w.kind, w.states.length); }
const last = words[2];
for (const s of last.states.filter(s => /^ph[oú]/.test(s.accented.normalize("NFD")[0] + s.accented[1] + "") || ["phố","phú","phù","phó"].includes(s.accented))) console.log(s.accented, s.local.toFixed(2), s.bonus.toFixed(2), s.official, s.contextual);
console.log("pbigram thanh phố", k.pBigram("thanh","phố"), "thanh phú", k.pBigram("thanh","phú"), "end phố", k.pBigram("phố","$"), "end phú", k.pBigram("phú","$"));
