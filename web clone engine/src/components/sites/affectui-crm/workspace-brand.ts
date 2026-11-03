/** Update legacy display copy without changing workspace IDs or storage keys. */
export function logioContent<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\bAcme\b|\bACME\b|\bacme(?=\.com\b)/g, match =>
      match === "Acme" ? "Logio" : match === "ACME" ? "LOGIO" : "logio",
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
