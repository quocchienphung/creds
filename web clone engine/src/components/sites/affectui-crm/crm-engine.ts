"use client";

import { useState } from "react";
import { useResource } from "@/lib/workspace-backend/react";
import { resources } from "../workspace-resources";
import seed from "./seed.json";

export interface Company {
  id: string;
  company: string;
  category: string;
  domain: string;
  owner: string;
  value: number;
  stage: string;
  lastContact: string;
}

export const columns = [
  { key: "company", label: "Company", type: "text" },
  { key: "category", label: "Category", type: "tag" },
  { key: "domain", label: "Domain", type: "url" },
  { key: "owner", label: "Owner", type: "text" },
  { key: "value", label: "Value", type: "number" },
  { key: "stage", label: "Stage", type: "tag" },
  { key: "lastContact", label: "Last contact", type: "text" },
] as const;
export type ColumnKey = (typeof columns)[number]["key"];
export const stages = ["New", "Qualified", "Proposal", "Negotiation", "Won"];
export const tones: Record<string, string> = {
  Productivity: "gray", Planning: "blue", Design: "pink", Payments: "violet",
  "E-commerce": "amber", "Developer Tools": "gray", CRM: "blue", New: "gray",
  Qualified: "blue", Proposal: "violet", Negotiation: "amber", Won: "green", Lost: "pink",
};
export const initialCompanies: Company[] = seed;
export const numberFormat = new Intl.NumberFormat("en-US");
export function emptyCompany(): Company {
  return { id: crypto.randomUUID(), company: "", category: "Productivity", domain: "", owner: "", value: 0, stage: "New", lastContact: "Today" };
}
export function setCell(row: Company, key: ColumnKey, value: string): Company {
  if (key === "value") {
    const numeric = Number(value.replaceAll(",", "").replaceAll("$", ""));
    return { ...row, value: Number.isFinite(numeric) ? numeric : row.value };
  }
  return { ...row, [key]: value };
}

/** Undo and redo walk back through earlier lists of rows. The rows themselves live in the backend. */
interface History { workspaceId: string; past: Company[][]; future: Company[][] }
export function useCrmEngine(workspaceId = "acme") {
  const [rows, setRows, sync] = useResource(resources.companies, workspaceId, workspaceId === "acme" ? initialCompanies : []);
  const [stored, setHistory] = useState<History>({ workspaceId, past: [], future: [] });
  // History belongs to one workspace; switching workspace starts it afresh.
  const history = stored.workspaceId === workspaceId ? stored : { workspaceId, past: [], future: [] };
  return {
    rows,
    change: (next: Company[]) => {
      if (JSON.stringify(rows) === JSON.stringify(next)) return;
      setHistory({ workspaceId, past: [...history.past.slice(-99), rows], future: [] });
      setRows(next);
    },
    undo: () => { if (!history.past.length) return; setHistory({ workspaceId, past: history.past.slice(0, -1), future: [rows, ...history.future] }); setRows(history.past.at(-1)!); },
    redo: () => { if (!history.future.length) return; setHistory({ workspaceId, past: [...history.past, rows], future: history.future.slice(1) }); setRows(history.future[0]); },
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    sync,
  };
}
export type CrmEngine = ReturnType<typeof useCrmEngine>;
