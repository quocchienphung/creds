"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { AnimatedSelect } from "@/components/interaction/AnimatedSelect";
import { storageCategories, type StorageCategory } from "./storage-model";

const options = storageCategories.map(value => ({ value, label: value, decoration: <i className="stg-category-dot" data-category={value} /> }));

export function StorageCategorySelect({ label, value, onChange, disabled }: { label: string; value: StorageCategory; onChange: (category: StorageCategory) => void; disabled?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  return <AnimatedSelect label={uiText(label)} value={value} options={options} disabled={disabled} onChange={next => {
    const category = storageCategories.find(category => category === next);
    if (category) onChange(category);
  }} />;
}
