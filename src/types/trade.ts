import { z } from "zod";

export const TradeSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  totalAmount: z.number(),
  currency: z.string().length(3),
  executedAt: z.string().datetime(),
  broker: z.string().min(1),
  rawData: z.record(z.string(), z.unknown()),
});

export type Trade = z.infer<typeof TradeSchema>;

export interface ParseError {
  row: number;
  reason: string;
}

export interface ParseResult {
  trades: Trade[];
  errors: ParseError[];
}

export interface ImportResponse {
  broker: string;
  summary: {
    total: number;
    valid: number;
    skipped: number;
  };
  trades: Trade[];
  errors: ParseError[];
  timestamp: string;
  filename?: string;
  processingTimeMs: number;
}
