import { knowledge } from "./geo-fixture.mjs";
import { recoverAddressText } from "./address-recovery.ts";
const k = knowledge();
const cells = ["Can h? chung cu V? D?nh s? 2.21", "NHA ? H?NH THANH TRONG TUONG LAI", "QSD dat tai thua so: 63, TBD so: 8-1, KV.5, TT.D?c Hoa, huyen Duc Hoa, tinh Long An", "Duong Tr?n Hung Dao, Phuong 5, Quan 5, TP HCM", "Phuong D?c Hoa", "Khu dan c?", "Duong Nguyen V?n Linh, Phuong T?n Phong, Quan 7", "Hem 81 Ba Cu, Phuong 4, Thanh pho V?ng T?u, tinh Ba Ria - V?ng T?u", "Xa H?a Th?nh, huy?n Ch? G?o, tinh Ti?n Giang"];
for (const c of cells) {
  const t0 = performance.now(), r = recoverAddressText(c, k, { policy: "FORCE_NO_QUESTION_MARK" });
  console.log("PROBE", JSON.stringify(c), "\n   =>", JSON.stringify(r.value), Math.round(performance.now() - t0) + "ms");
  for (const s of r.segments) for (const t of s.tokens) console.log("      ", t.original, "->", t.ascii, `[${t.accented}]`, t.status, "margin", t.margin.toFixed(1), t.evidence.join("; "));
}
