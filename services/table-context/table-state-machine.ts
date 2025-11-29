import type { Database } from "@/types/database.types";

type TableStatus = Database["public"]["Enums"]["table_status"];

const VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  inactive: ["active"],
  active: ["inactive", "closed"],
  closed: [],
};

export function canTransition(from: TableStatus, to: TableStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateTransition(from: TableStatus, to: TableStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid table status transition: ${from} → ${to}`);
  }
}

export type TableTransitionResult = {
  success: boolean;
  previousStatus: TableStatus;
  newStatus: TableStatus;
  tableId: string;
};
