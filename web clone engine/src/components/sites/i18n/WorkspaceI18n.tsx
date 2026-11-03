"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { defineResource } from '@/lib/workspace-backend';
import { useResource } from '@/lib/workspace-backend/react';
import { translate, type Translate, type WorkspaceLocale } from './translate';

const localeResource = defineResource<WorkspaceLocale>({
  name: 'interface-language', scope: 'account', storage: 'device',
  parse: raw => raw === 'en' || raw === 'vi' ? raw : undefined,
});
const English = { locale: 'en' as WorkspaceLocale, setLocale: (() => {}) as (locale: WorkspaceLocale) => void, t: (<T,>(value: T, values?: readonly unknown[]) => translate(value, 'en', values)) as Translate };
const Context = createContext(English);

/** Shared by the selector, all workspace pages and their portals. English is the original/default version. */
export function WorkspaceI18nProvider({ children }: { children: ReactNode }) {
  const [storedLocale, setStoredLocale] = useResource(localeResource, undefined, 'en');
  const pathname = usePathname();
  const workspace = pathname === '/personalize' || pathname === '/skilled';
  const locale = workspace ? storedLocale : 'en';
  const [dictionary, setDictionary] = useState<Readonly<Record<string, string>>>({});
  // Prewarm while the workspace loads. The marketing pages do not download the Vietnamese catalog.
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    void import('./vi').then(({ vi }) => { if (active) setDictionary(vi); });
    return () => { active = false; };
  }, [workspace]);
  useEffect(() => { document.documentElement.lang = locale === 'vi' ? 'vi' : 'en-US'; }, [locale]);
  const setLocale = useCallback((next: WorkspaceLocale) => setStoredLocale(next), [setStoredLocale]);
  const t: Translate = useCallback(<T,>(value: T, values?: readonly unknown[]) => translate(value, locale, values, dictionary), [locale, dictionary]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useWorkspaceI18n = () => useContext(Context);
