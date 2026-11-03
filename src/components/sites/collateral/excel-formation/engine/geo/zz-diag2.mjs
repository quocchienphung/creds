import { recoverAddressText } from "./address-recovery.ts";
import { knowledge } from "./geo-fixture.mjs";
const k = knowledge();
for (const text of ["X? Thanh Ph?, Th? x? B?nh Long, T?nh B?nh Ph??c", "Ph??ng H??ng V?n, Th? x? H??ng Tr?, T?nh Th?a Thi?n Hu?", "X? Qu? M? Th?nh, Huy?n T?n Tr?, T?nh Long An"]) {
  const r = recoverAddressText(text, k, { policy: "FORCE_NO_QUESTION_MARK" });
  for (const s of r.segments) for (const t of s.tokens) console.log(t.original, "->", t.accented, t.status, t.margin.toFixed(1), "runner", t.runnerUp, "|", t.evidence.join("; "));
  console.log("--");
}
console.log(k.matchWindow(["thanh", "phu"], 5).map(m => m.name.text + "/" + m.name.group + "/" + m.name.parent));
console.log(k.matchWindow(["thanh", "pho"], 5).map(m => m.name.text + "/" + m.name.group));
