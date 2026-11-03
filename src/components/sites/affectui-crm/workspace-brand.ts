/** Update legacy display copy without changing workspace IDs or storage keys. */
export function logioContent<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\b(?:Acme|Logio)\b|\b(?:ACME|LOGIO)\b|\b(?:acme|logio)(?=\.com\b)/g, match =>
      match === match.toUpperCase() ? "DAMENCI" : match === match.toLowerCase() ? "damenci" : "Damenci",
    ) as T;
  }
  if (Array.isArray(value)) {
    const next = value.map(item => logioContent(item));
    return (next.some((item, index) => item !== value[index]) ? next : value) as T;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next = Object.fromEntries(Object.entries(value).map(([key, item]) => {
      // These are identifiers and assets, not display copy.
      const updated = ["id", "workspaceId", "avatar", "logo"].includes(key) ? item : logioContent(item);
      changed ||= updated !== item;
      return [key, updated];
    }));
    return (changed ? next : value) as T;
  }
  return value;
}

/** Rename the demo account while preserving custom profiles and unrelated contacts. */
export function profileContent<T extends { name: string; email: string }>(value: T): T {
  const next = logioContent(value);
  const name = next.name === "Alex Morgan" ? "Damenci" : next.name;
  const email = next.email === "alex@damenci.com" ? "damenci@damenci.com" : next.email;
  return name === next.name && email === next.email ? next : { ...next, name, email };
}
