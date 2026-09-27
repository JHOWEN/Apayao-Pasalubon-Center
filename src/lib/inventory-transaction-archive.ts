export type InventoryTransactionArchiveAction = "archive" | "restore";
export type InventoryTransactionArchiveFilter = "all" | "archived";

export function normalizeArchiveAction(
  action: string | undefined | null,
): InventoryTransactionArchiveAction | null {
  const normalized = typeof action === "string" ? action.trim().toLowerCase() : "";

  if (normalized === "archive" || normalized === "archived") {
    return "archive";
  }

  if (normalized === "restore" || normalized === "restored") {
    return "restore";
  }

  return null;
}

export function normalizeArchiveIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry): entry is string => Boolean(entry)))];
  }

  if (typeof value === "string") {
    return [...new Set(value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean))];
  }

  return [];
}

export function normalizeArchiveFilter(
  value: string | undefined | null,
): InventoryTransactionArchiveFilter {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (normalized === "archived") {
    return "archived";
  }

  return "all";
}
