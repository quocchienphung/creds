import { knowledge } from "./geo-fixture.mjs";
const k = knowledge();
for (const group of ["street", "place", "feature", "ward"]) {
  const names = k.names.filter(n => n.group === group), total = new Map(), first = new Map();
  for (const n of names) n.toks.forEach((t, i) => { const w = t.toLowerCase(); total.set(w, (total.get(w) ?? 0) + 1); if (i === 0) first.set(w, (first.get(w) ?? 0) + 1); });
  const rows = [...first].filter(([w, c]) => c >= Math.max(3, names.length * 0.004)).map(([w, c]) => [w, c, (c / total.get(w)).toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, 22);
  console.log("PROBE", group, names.length, rows.map(r => r.join(":")).join("  "));
}
