import { loadConcepts, SLOT_VALUES, type Concept, type TextDomain } from "./ontology.ts";
import { toAscii } from "../geo/vn-text.ts";

/**
 * Synthetic Collateral Corruption Lab: generates collateral descriptions with known ground truth from the ontology and versioned templates, then damages
 * them the way a legacy export does. It is a development and calibration tool; its scores are SYNTHETIC and never say how the engine does on real files.
 *
 * Leakage control: every concept is assigned to train / validation / test by a hash of its id, and every template family to a split of its own. A record
 * takes the split of its template and draws its concepts only from that split's pool, so a test description shares neither a core concept nor a template
 * family with anything the lexicon or the calibration saw. Numbers and codes are fabricated.
 */
export const LAB_VERSION = "synthetic-lab-1";
export type Split = "train" | "validation" | "test";
export interface SyntheticRecord {
  syntheticId: string; templateId: string; assetDomains: TextDomain[]; accentedTruth: string; asciiTruth: string; corruptedInput: string;
  corruptionPositions: number[]; protectedAnchors: string[]; semanticSlots: Record<string, string>; corruptionPatternIds: string[];
  split: Split; seed: number; difficulty: "easy" | "medium" | "hard"; /** Words (by index in the text) whose `?` was inserted; the rest of the text is clean or plain. */ damagedWords: number[];
}

export function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hash(text: string): number { let h = 2166136261; for (const ch of text) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; }
// One-word concepts (tại, của, và) are glue every text uses: they always sit in the train pool, so the held-out conditions do not invent an artificial unknown word.
export const splitOfConcept = (c: Concept): Split => { if (!c.canonical.includes(" ")) return "train"; const h = hash(c.id) % 100; return h < 70 ? "train" : h < 85 ? "validation" : "test"; };

type DomainKey = TextDomain;
interface Template { id: string; split: Split; text: string }
// `{domain}` takes a concept of that domain from the record's split pool; `{n}` `{area}` `{cert}` `{contract}` `{date}` `{plate}` `{vin}` `{year}` `{amount}` `{org}` are fabricated.
const T = (id: string, split: Split, text: string): Template => ({ id, split, text });
export const TEMPLATES: Template[] = [
  T("land-1", "train", "{land_use_right} tại thửa đất số {n}, tờ bản đồ số {n}, diện tích {area} mét vuông"),
  T("land-2", "train", "{land_use_right}, {land_attached_asset} theo giấy chứng nhận số {cert}"),
  T("land-3", "validation", "{land_use_right} và {land_attached_asset} thuộc sở hữu của {org}"),
  T("land-4", "test", "Thông tin tài sản: {land_use_right}; {house_and_building} gắn liền với đất"),
  T("house-1", "train", "{house_and_building} thuộc dự án {org}, tầng {n}, diện tích {area} mét vuông"),
  T("house-2", "validation", "{house_and_building}, {land_attached_asset} theo hợp đồng mua bán số {contract}"),
  T("house-3", "test", "Tài sản bảo đảm là {house_and_building} số {n}, {geographic_address} {org}"),
  T("future-1", "train", "{future_asset} theo hợp đồng mua bán số {contract} ngày {date}"),
  T("future-2", "test", "{future_asset} do {org} làm chủ đầu tư, {property_rights_and_receivables}"),
  T("vehicle-1", "train", "{vehicle_and_transport} biển số {plate}, số khung {vin}, số máy {vin}"),
  T("vehicle-2", "validation", "{vehicle_and_transport} năm sản xuất {year}, {vehicle_and_transport}"),
  T("vehicle-3", "test", "Phương tiện: {vehicle_and_transport}, giấy đăng ký số {cert}"),
  T("mach-1", "train", "{machinery_equipment} theo hợp đồng mua bán số {contract}"),
  T("mach-2", "validation", "{machinery_equipment}, {machinery_equipment} năm sản xuất {year}"),
  T("mach-3", "test", "Tài sản gồm {machinery_equipment} và {inventory_and_goods} tại kho {org}"),
  T("inv-1", "train", "{inventory_and_goods} khối lượng {n} tấn tại kho {org}"),
  T("inv-2", "validation", "{inventory_and_goods}, {inventory_and_goods} số lượng {n}"),
  T("inv-3", "test", "Biên bản kiểm kê {inventory_and_goods}, đơn giá {amount} đồng"),
  T("dep-1", "train", "{deposit_and_valuable_papers} số {n} trị giá {amount} đồng, kỳ hạn {n} tháng"),
  T("dep-2", "validation", "{deposit_and_valuable_papers} tại ngân hàng, số tiền {amount} đồng"),
  T("dep-3", "test", "Tài sản bảo đảm là {deposit_and_valuable_papers} do {org} sở hữu"),
  T("right-1", "train", "{property_rights_and_receivables} phát sinh từ hợp đồng số {contract}"),
  T("right-2", "validation", "{property_rights_and_receivables} theo hợp đồng ngày {date}"),
  T("right-3", "test", "{property_rights_and_receivables}, {property_rights_and_receivables} của {org}"),
  T("status-1", "train", "{ownership_and_security_status} theo hợp đồng số {contract}"),
  T("status-2", "validation", "Tình trạng pháp lý: {ownership_and_security_status}, {general_collateral_description}"),
  T("status-3", "test", "Tài sản {ownership_and_security_status}, {ownership_and_security_status} số {cert}"),
  T("gen-1", "train", "{general_collateral_description} số {cert} ngày {date}"),
  T("gen-2", "validation", "{general_collateral_description}, {general_collateral_description}"),
  T("gen-3", "test", "Hồ sơ: {general_collateral_description} do {org} cấp"),
  T("mix-1", "train", "{land_use_right} và {house_and_building} tại {geographic_address} số {n}"),
  T("mix-2", "validation", "{machinery_equipment} và {property_rights_and_receivables}"),
  T("mix-3", "test", "{future_asset} và {property_rights_and_receivables} theo {general_collateral_description}"),
];
const ORGS = ["Minh Phát", "Hòa Bình", "An Khang", "Thành Đạt", "Bình Minh", "Hưng Thịnh", "Phú Cường", "Đại Nam", "Kim Long", "Tân Tiến", "Hải Âu", "Trường Sinh"];

const POOL = new Map<string, Concept[]>();
const pool = (concepts: readonly Concept[], split: Split, domain: DomainKey): Concept[] => {
  const key = split + "|" + domain + "|" + concepts.length; let list = POOL.get(key);
  if (!list) POOL.set(key, list = concepts.filter(c => c.domain === domain && splitOfConcept(c) === split && c.canonical.split(" ").length <= 6));
  return list;
};

export function generateClean(templateText: string, split: Split, random: () => number, concepts: readonly Concept[]): { text: string; domains: TextDomain[]; anchors: string[]; slots: Record<string, string> } {
  const domains: TextDomain[] = [], anchors: string[] = [], slots: Record<string, string> = {};
  const num = (digits: number) => { let s = String(1 + Math.floor(random() * 9)); while (s.length < digits) s += Math.floor(random() * 10); return s; };
  const text = templateText.replace(/\{(\w+)\}/g, (_, name: string) => {
    let value: string;
    switch (name) {
      case "n": value = num(1 + Math.floor(random() * 3)); anchors.push(value); return value;
      case "area": value = num(2) + "," + num(1); anchors.push(value); return value;
      case "cert": value = String.fromCharCode(65 + Math.floor(random() * 26)) + String.fromCharCode(65 + Math.floor(random() * 26)) + " " + num(6); anchors.push(...value.split(" ")); return value;
      case "contract": value = num(3) + "/" + (2015 + Math.floor(random() * 10)) + "/HĐTC"; anchors.push(value); return value;
      case "date": value = num(2).slice(0, 1) + "/" + (1 + Math.floor(random() * 12)) + "/" + (2015 + Math.floor(random() * 10)); anchors.push(value); return value;
      case "plate": value = (10 + Math.floor(random() * 80)) + "A-" + num(5); anchors.push(value); return value;
      case "vin": value = "RL4" + num(8); anchors.push(value); return value;
      case "year": value = String(2008 + Math.floor(random() * 16)); anchors.push(value); return value;
      case "amount": value = num(3) + ".000.000"; anchors.push(value); return value;
      case "org": return `Công ty TNHH ${ORGS[Math.floor(random() * ORGS.length)]}`;
      default: {
        const list = pool(concepts, split, name as DomainKey);
        if (!list.length) throw new Error(`no ${split} concept in ${name}`);
        const concept = list[Math.floor(random() * list.length)];
        domains.push(concept.domain); slots[name] = concept.canonical; return concept.canonical;
      }
    }
  });
  return { text: text.replace(/^./u, ch => ch.toUpperCase()), domains: [...new Set(domains)], anchors, slots };
}

const markedAt = (word: string) => [...word.normalize("NFC")].flatMap((ch, i) => /\p{L}/u.test(ch) && toAscii(ch) !== ch ? [i] : []);
const isOpaque = (word: string) => /\d/.test(word) || /^(Công|TNHH)$/.test(word) || ORGS.some(org => org.split(" ").includes(word));

export type PatternId = "one_letter" | "multi_letter" | "mixed_plain_and_q" | "span_to_one_q" | "whole_short_token" | "first_char" | "last_char" | "uppercase" | "ascii_context" | "accented_context";
/** Damage a clean text the way a legacy export does. Returns the damaged text and which words carry the damage. */
export function corrupt(truth: string, random: () => number, level: "easy" | "medium" | "hard"): { input: string; patterns: PatternId[]; damaged: number[]; /** The truth in the case the input was written in. */ cased: string } {
  const upper = random() < 0.05, text = upper ? truth.toUpperCase() : truth, patterns: PatternId[] = upper ? ["uppercase"] : [];
  const words = text.normalize("NFC").split(" ");
  // The text around the damage: plain ASCII (the usual no-diacritic export) or still accented.
  const asciiContext = random() < 0.65; patterns.push(asciiContext ? "ascii_context" : "accented_context");
  const out = words.map(word => isOpaque(word) ? word : asciiContext ? toAscii(word) : word);
  const eligible = words.map((word, i) => i).filter(i => !isOpaque(words[i]) && markedAt(words[i]).length);
  if (!eligible.length) return { input: out.join(" "), patterns, damaged: [], cased: text };
  const count = level === "easy" ? 1 : level === "medium" ? 1 + Math.floor(random() * 2) : Math.max(2, Math.ceil(eligible.length * (0.6 + random() * 0.4)));
  const chosen = [...eligible].sort(() => random() - 0.5).slice(0, count);
  const damaged: number[] = [];
  for (const i of chosen) {
    const word = words[i], chars = [...word.normalize("NFC")], marked = markedAt(word), roll = random();
    const next = [...out[i]];
    let pattern: PatternId;
    if (chars.length === 1 && marked.length && roll < 0.5) { pattern = "whole_short_token"; damaged.push(i); out[i] = "?".repeat(1); patterns.push(pattern); continue; }
    if (roll < 0.1 && chars.length >= 3) {
      // a span of two letters (one carrying a mark) is lost as a single `?`
      const at = marked[Math.floor(random() * marked.length)]; if (at === undefined) continue;
      const from = Math.min(at, chars.length - 2); pattern = "span_to_one_q";
      if (!/^\p{L}{2}$/u.test(chars.slice(from, from + 2).join(""))) continue; // two letters, never punctuation
      out[i] = [...next.slice(0, from), "?", ...next.slice(from + 2)].join(""); damaged.push(i); patterns.push(pattern); continue;
    }
    if (marked.length === 0) continue;
    const q = level === "easy" ? 1 : 0.85;
    let slots = marked;
    if (roll < 0.3) { slots = [marked[Math.floor(random() * marked.length)]]; pattern = "one_letter"; }
    else if (roll < 0.4) { slots = [marked[0]]; pattern = "first_char"; }
    else if (roll < 0.5) { slots = [marked[marked.length - 1]]; pattern = "last_char"; }
    else pattern = random() < 0.25 ? "mixed_plain_and_q" : "multi_letter";
    let any = false;
    for (const k of slots) if (pattern === "one_letter" || pattern === "first_char" || pattern === "last_char" || random() < q) { next[k] = "?"; any = true; }
    if (!any) next[slots[0]] = "?";
    out[i] = next.join(""); damaged.push(i); patterns.push(pattern);
  }
  return { input: out.join(" "), patterns: [...new Set(patterns)], damaged: damaged.sort((a, b) => a - b), cased: text };
}

export interface GenerateOptions { split: Split; count: number; seed: number; concepts?: readonly Concept[]; templates?: readonly string[] }
/** Records of one split. The same seed gives the same records. */
export function generate(options: GenerateOptions): SyntheticRecord[] {
  const concepts = options.concepts ?? loadConcepts(), random = rng(options.seed ^ hash(options.split));
  const templates = TEMPLATES.filter(t => t.split === options.split && (!options.templates || options.templates.includes(t.id)));
  const out: SyntheticRecord[] = [];
  for (let n = 0; out.length < options.count && n < options.count * 20; n++) {
    const template = templates[n % templates.length], level = (["easy", "medium", "hard"] as const)[Math.floor(random() * 3)];
    const clean = generateClean(template.text, options.split, random, concepts), bad = corrupt(clean.text, random, level);
    if (!bad.input.includes("?")) continue;
    out.push({
      syntheticId: `${options.split}-${options.seed}-${out.length}`, templateId: template.id, assetDomains: clean.domains, accentedTruth: bad.cased, asciiTruth: toAscii(bad.cased),
      corruptedInput: bad.input, corruptionPositions: [...bad.input].flatMap((ch, i) => ch === "?" ? [i] : []), protectedAnchors: clean.anchors, semanticSlots: clean.slots,
      corruptionPatternIds: bad.patterns, split: options.split, seed: options.seed, difficulty: level, damagedWords: bad.damaged,
    });
  }
  return out;
}
/** Clean wording composed from the templates and the concepts of the given splits: the extra corpus a lexicon may be given (ablation: with synthetic composition). */
export function trainingCorpus(count: number, seed: number, concepts: readonly Concept[] = loadConcepts(), splits: readonly Split[] = ["train"]): Concept[] {
  const random = rng(seed ^ 0x5eed), seen = new Set<string>(), out: Concept[] = [];
  // Production draws every split (no held-out data exists there); the benchmark draws "train" only.
  const plan = splits.flatMap(split => TEMPLATES.filter(t => t.split === split).map(t => ({ split, text: t.text })));
  for (let n = 0; out.length < count && n < count * 10; n++) {
    const step = plan[n % plan.length], clean = generateClean(step.text, step.split, random, concepts);
    // The numbers are fabricated per record; only the wording is a corpus.
    const wording = clean.text.replace(/Công ty TNHH [^,;]*?(?= làm| cấp| sở hữu|[,;]|$)/g, "").replace(/\b[A-Z]{2}\b/g, "").replace(/\d[\d.,/A-Za-z-]*/g, "").replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1").trim().toLowerCase();
    if (wording.length < 6 || seen.has(wording)) continue; seen.add(wording);
    out.push({ id: `synthetic:${seen.size}`, domain: clean.domains[0] ?? "unknown", canonical: wording.replace(/[,;:]/g, ""), source: "PRACTICE" });
  }
  return out;
}
export const protectedAttributes = SLOT_VALUES;
