import { workspaceSections } from "../affectui-crm/workspace-state";

export interface NavigationItem {
  id: string;
  label: string;
  description: string;
  group: string;
  href: string;
  icon: "home" | "compass" | "page" | "card" | "chart" | "code" | "settings" | "users" | "workflow" | "chat" | "folder" | "book" | "shield";
  keywords?: readonly string[];
}

const workspaceDescriptions: Record<string, string> = {
  "Excel formation": "Find and repair errors in a workbook", "JSON formation": "Group the repaired data into the reporting JSON", Queue: "Saved upload history and original workbooks", Converter: "Turn a worksheet into a CSV file",
};
const workspaceIcons: Record<string, NavigationItem["icon"]> = { "Excel formation": "folder", "JSON formation": "code", Queue: "folder", Converter: "workflow" };
const aliases: Record<string, readonly string[]> = {
  Queue: ["upload", "history", "xlsx", "files", "lịch sử", "hàng đợi"], Converter: ["convert", "csv", "excel", "xlsx", "chuyển đổi", "xuất csv"],
  "Excel formation": ["collateral", "tài sản bảo đảm", "excel", "xlsx", "sửa lỗi", "repair"], "JSON formation": ["collateral", "tài sản bảo đảm", "json", "báo cáo", "report"],
};

const workspaceItems: NavigationItem[] = workspaceSections.map(label => ({
  id: `workspace-${label.toLowerCase().replaceAll(" ", "-")}`, label, description: workspaceDescriptions[label], group: label === "Converter" ? "Tools" : "Rules",
  href: `/personalize?section=${label.toLowerCase().replaceAll(" ", "-")}`,
  icon: workspaceIcons[label] ?? "page", keywords: aliases[label],
}));

export const navigationItems: readonly NavigationItem[] = [
  ...workspaceItems,
  ...([
    ["general", "General settings", "Workspace and regional defaults"], ["appearance", "Appearance", "Theme, text and interface motion"],
    ["notifications", "Notifications", "Email and desktop preferences"], ["security", "Security", "Workspace security policy"],
    ["where-you-log", "Where you log", "Account sign-in and sessions"], ["members", "Members", "Workspace access and roles"], ["billing", "Billing settings", "Invoice and currency preferences"],
  ] as const).map(([id, label, description]) => ({ id: `settings-${id}`, label, description, group: "Settings", href: `/personalize?section=excel-formation&settings=${id}`, icon: id === "security" || id === "where-you-log" ? "shield" as const : "settings" as const, keywords: ["cài đặt", id] })),
];

export interface NavigationMatch { item: NavigationItem; score: number; positions: readonly number[] }
export function normalizeQuery(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}

/** Every query word must match; prefer label prefixes, then substrings, then ordered letters. */
export function searchNavigation(items: readonly NavigationItem[], query: string): NavigationMatch[] {
  const words = normalizeQuery(query).trim().split(/\s+/).filter(Boolean);
  const matches: NavigationMatch[] = [];
  for (const item of items) {
    const label = normalizeQuery(item.label), other = normalizeQuery(`${item.description} ${item.group} ${(item.keywords ?? []).join(" ")}`);
    let score = 0; const positions = new Set<number>(); let found = true;
    for (const word of words) {
      const at = label.indexOf(word);
      if (at >= 0) { score += at === 0 ? 100 : 70; for (let n=at;n<at+word.length;n++) positions.add(n); continue; }
      if (other.split(/\s+/).some(part => part.startsWith(word))) { score += 35; continue; }
      const indices: number[] = []; let cursor = 0;
      for (const letter of word) { const i = label.indexOf(letter, cursor); if (i < 0) break; indices.push(i); cursor = i+1; }
      if (indices.length !== word.length) { found = false; break; }
      score += 10; indices.forEach(n => positions.add(n));
    }
    if (found) matches.push({item, score, positions: [...positions].sort((a,b)=>a-b)});
  }
  // Groups follow their strongest match and preserve the original order when scores tie.
  const groupScores = new Map<string,number>();
  matches.forEach(m=>groupScores.set(m.item.group, Math.max(groupScores.get(m.item.group) ?? 0,m.score)));
  const groupOrder = [...new Set(matches.map(m=>m.item.group))].sort((a,b)=>(groupScores.get(b)??0)-(groupScores.get(a)??0));
  return matches.sort((a,b)=>groupOrder.indexOf(a.item.group)-groupOrder.indexOf(b.item.group) || b.score-a.score);
}
