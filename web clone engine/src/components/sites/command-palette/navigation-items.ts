import { guideGroups } from "../guide-navigation/navigation-model";

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
  Invoice: "Create and manage invoices", "New chat": "Talk with your assistant", Files: "Workspace files", Run: "Agent plans and activity",
  Queue: "Saved upload history and original workbooks", Usage: "Plans, members and API keys", "Excel formation": "Find and repair errors in a workbook", "JSON formation": "Group the repaired data into the reporting JSON", Home: "Your workspace overview", Companies: "Company CRM", Contacts: "People and contact details",
  Deals: "Your sales pipeline", Reports: "Analytics and reports", "New business": "New business pipeline", Renewals: "Renewal pipeline", Partnerships: "Partnership pipeline",
  Mapping: "Projects, teams and tasks", Process: "Build and run your process", Tracing: "Inspect process runs", Orchestrator: "A lead agent and parallel workers", Skilled: "Your skill library", Repo: "Workspace activity", Storage: "Document knowledge library",
};
const workspaceIcons: Record<string, NavigationItem["icon"]> = {
  Invoice: "page", "New chat": "chat", Files: "folder", Run: "workflow", Queue: "folder", Usage: "chart", "Excel formation": "folder", "JSON formation": "code", Home: "home", Companies: "users", Contacts: "users",
  Reports: "chart", Mapping: "workflow", Process: "workflow", Tracing: "workflow", Orchestrator: "workflow", Skilled: "book", Repo: "code", Storage: "folder",
};
const aliases: Record<string, readonly string[]> = {
  Queue: ["upload", "history", "xlsx", "files", "l?ch s?", "h?ng ??i"], Process: ["quy trình", "quy trinh", "workflow", "blocks", "map"], Tracing: ["trace", "theo dõi", "waterfall"], Orchestrator: ["điều phối", "agents", "subagents", "parallel", "timeline"], Storage: ["lưu trữ", "tai lieu", "documents", "knowledge"],
  Skilled: ["skills", "kỹ năng"], Reports: ["báo cáo", "analytics"], Companies: ["công ty", "crm"], Contacts: ["liên hệ"], Invoice: ["hóa đơn", "sales"],
  Usage: ["sử dụng", "plan", "credits"], "Excel formation": ["collateral", "tài sản bảo đảm", "excel", "xlsx", "sửa lỗi", "repair"], "JSON formation": ["collateral", "tài sản bảo đảm", "json", "báo cáo", "report"], Home: ["trang chủ", "dashboard"], "New chat": ["trò chuyện", "assistant", "ai"],
};

const workspaceItems: NavigationItem[] = guideGroups.flatMap(group => [...group.sections, ...group.pipelines].map(label => ({
  id: `workspace-${label.toLowerCase().replaceAll(" ", "-")}`, label, description: workspaceDescriptions[label], group: group.name,
  href: label === "Skilled" ? "/skilled" : `/personalize?section=${label.toLowerCase().replaceAll(" ", "-")}`,
  icon: workspaceIcons[label] ?? "page", keywords: aliases[label],
})));

const products: readonly [string, string, string, NavigationItem["icon"]][] = [
  ["Payments", "/payments", "Online payments", "card"], ["Checkout", "/payments/checkout", "Prebuilt payment form", "card"],
  ["Elements", "/payments/elements", "Flexible UI components", "code"], ["Payment Links", "/payments/payment-links", "No-code payments", "card"],
  ["Payment methods", "/payments/payment-methods", "Payment method library", "card"], ["Link", "/payments/link", "Accelerated checkout", "card"],
  ["Terminal", "/terminal", "In-person payments", "card"], ["Managed Payments", "/managed-payments", "Merchant of record", "card"],
  ["Authorization Boost", "/authorization-boost", "Acceptance optimizations", "chart"], ["Financial Connections", "/financial-connections", "Linked financial accounts", "card"],
  ["Billing", "/billing", "Recurring revenue", "card"], ["Subscriptions", "/billing/subscriptions", "Subscription management", "card"],
  ["Usage-based billing", "/billing/usage-based-billing", "Usage and metered pricing", "chart"], ["Invoicing", "/invoicing", "One-time or recurring invoices", "page"],
  ["Tax", "/tax", "Sales tax and VAT", "page"], ["Revenue Recognition", "/revenue-recognition", "Accounting automation", "chart"],
  ["Sigma", "/sigma", "Custom reports", "chart"], ["Data Pipeline", "/data-pipeline", "Data sync", "code"],
];

export const navigationItems: readonly NavigationItem[] = [
  { id: "site-home", label: "Homepage", description: "Back to Stripe", group: "Navigate", href: "/", icon: "home", keywords: ["trang chủ", "website"] },
  { id: "explore", label: "Explore pages", description: "Choose a workspace", group: "Navigate", href: "/personalize?browse=1", icon: "compass", keywords: ["all pages", "điều hướng", "tất cả"] },
  { id: "guide", label: "Guide me", description: "Your interactive introduction", group: "Navigate", href: "/guide", icon: "compass" },
  ...workspaceItems,
  ...products.map(([label, href, description, icon]) => ({ id: `product-${href.slice(1).replaceAll("/", "-")}`, label, href, description, icon, group: "Products" })),
  ...([
    ["general", "General settings", "Workspace and regional defaults"], ["appearance", "Appearance", "Theme, text and interface motion"],
    ["notifications", "Notifications", "Email and desktop preferences"], ["security", "Security", "Workspace security policy"],
    ["where-you-log", "Where you log", "Account sign-in and sessions"], ["members", "Members", "Workspace access and roles"], ["billing", "Billing settings", "Invoice and currency preferences"],
  ] as const).map(([id, label, description]) => ({ id: `settings-${id}`, label, description, group: "Settings", href: `/personalize?section=home&settings=${id}`, icon: id === "security" || id === "where-you-log" ? "shield" as const : "settings" as const, keywords: ["cài đặt", id] })),
  ...(["General", "Members", "Billing", "API keys"] as const).map(label => ({ id: `usage-${label.toLowerCase().replaceAll(" ", "-")}`, label: `Usage · ${label}`, description: "Agent usage and plan management", group: "Usage", href: `/personalize?section=usage&settings-tab=${label.toLowerCase().replaceAll(" ", "-")}`, icon: "chart" as const })),
  ...["Company CRM", "Team strategy", "Pixel integration", "Sales docs"].map(label => ({ id: `view-${label.toLowerCase().replaceAll(" ", "-")}`, label, description: "Company CRM view", group: "Views", href: `/personalize?section=companies&crm-view=${encodeURIComponent(label)}`, icon: "page" as const })),
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
