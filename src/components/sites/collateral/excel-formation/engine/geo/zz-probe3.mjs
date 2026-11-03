import { knowledge } from "./geo-fixture.mjs";
import { classifySegments, typeIndexOf } from "./address-classifier.ts";
const k = knowledge(), idx = typeIndexOf(k);
console.log("PROBE types", idx.types.size, [...idx.types.keys()].filter(t => /^(hop|dong|tin|gia|tri|tai|san|so|nguyen|nha|ngan|hang|can|ho)( |$)/.test(t)).join(" | "));
console.log("PROBE abbr", [...idx.abbreviations.keys()].slice(0, 40).join(" "));
for (const c of ["Hop dong tin dung so 123/2020", "Gia tri tai san: 1.200.000.000 dong", "Nguyen V?n A", "Ngan hang TMCP Ngoai thuong"]) for (const s of classifySegments(c, k)) console.log("PROBE", JSON.stringify(c), s.class, s.score.toFixed(1), s.evidence.join("; "));
