import { knowledge } from "./geo-fixture.mjs";
import { classifySegments, typeIndexOf } from "./address-classifier.ts";
const k = knowledge(), idx = typeIndexOf(k);
console.log("PROBE types", [...idx.types].map(([t, i]) => t + (i.strong ? "*" : "")).join(" | "));
console.log("PROBE abbr", [...idx.abbreviations.keys()].join(" "));
const cells = ["Can h? chung cu V? D?nh s? 2.21", "NHA ? H?NH THANH TRONG TUONG LAI", "QSD dat tai thua so: 63, TBD so: 8-1, KV.5, TT.D?c Hoa, huyen Duc Hoa, tinh Long An", "Duong Tr?n Hung Dao, Phuong 5, Quan 5, TP HCM", "Nguyen V?n A", "Hop dong tin dung so 123/2020", "Ngan hang TMCP Ngoai thuong", "37 can h? c?a d? an", "Hem 81 Ba Cu, Phuong 4", "Gia tri tai san: 1.200.000.000 dong", "Phuong D?c Hoa", "Khu dan c?"];
for (const c of cells) console.log("PROBE", JSON.stringify(c), "=>", classifySegments(c, k).map(s => `${s.class}(${s.score.toFixed(1)})`).join(" | "));
