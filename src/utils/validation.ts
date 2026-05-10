import { z } from "zod";
import { TradeSchema, type Trade, type ParseError } from "../types/trade.js";

export function validateTrade(
  trade: unknown,
  rowNumber: number
): { trade: Trade | null; error: ParseError | null } {
  const result = TradeSchema.safeParse(trade);

  if (result.success) {
    return { trade: result.data, error: null };
  }

  const issues = result.error.issues.map((issue) => issue.message).join("; ");
  return {
    trade: null,
    error: {
      row: rowNumber,
      reason: issues,
    },
  };
}
