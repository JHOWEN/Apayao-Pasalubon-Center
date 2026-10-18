export const DIRECT_STOCK_OUT_REASON_VALUES = [
  "DAMAGED",
  "LOST",
  "EXPIRED",
  "OTHER",
] as const;

export type DirectStockOutReason = (typeof DIRECT_STOCK_OUT_REASON_VALUES)[number];

export const DIRECT_STOCK_OUT_REASON_LABELS: Record<DirectStockOutReason, string> = {
  DAMAGED: "Damaged",
  LOST: "Lost / Missing",
  EXPIRED: "Expired",
  OTHER: "Other",
};

export function isDirectStockOutReason(value: unknown): value is DirectStockOutReason {
  return typeof value === "string" && DIRECT_STOCK_OUT_REASON_VALUES.includes(value as DirectStockOutReason);
}

export function getDirectStockOutReasonLabel(value: string | null | undefined) {
  if (!value) return "Unspecified (older entry)";
  if (isDirectStockOutReason(value)) return DIRECT_STOCK_OUT_REASON_LABELS[value];
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
