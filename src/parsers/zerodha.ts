import { parse } from "csv-parse/sync";
import type { ParseResult, Trade, ParseError } from "../types/trade.js";
import { validateTrade } from "../utils/validation.js";

interface ZerodhaRow {
  symbol: string;
  isin: string;
  trade_date: string;
  trade_type: string;
  quantity: string;
  price: string;
  trade_id: string;
  order_id: string;
  exchange: string;
  segment: string;
  [key: string]: string;
}

function parseZerodhaDate(dateStr: string): string | null {
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);

  if (
    isNaN(date.getTime()) ||
    date.getUTCDate() !== parseInt(day, 10) ||
    date.getUTCMonth() + 1 !== parseInt(month, 10) ||
    date.getUTCFullYear() !== parseInt(year, 10)
  ) {
    return null;
  }

  return `${year}-${month}-${day}T00:00:00Z`;
}

function normalizeSide(tradeType: string): "BUY" | "SELL" | null {
  const normalized = tradeType.trim().toUpperCase();
  if (normalized === "BUY") return "BUY";
  if (normalized === "SELL") return "SELL";
  return null;
}

function inferCurrency(exchange: string): string {
  const normalized = exchange.trim().toUpperCase();
  if (normalized === "NSE" || normalized === "BSE") return "INR";
  return "INR";
}

function parseNumber(value: string, fieldName: string): { value: number; error: string | null } {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === undefined || trimmed === null) {
    return { value: NaN, error: `${fieldName} is required` };
  }
  const num = Number(trimmed);
  if (isNaN(num)) {
    return { value: NaN, error: `${fieldName} must be a number, got '${trimmed}'` };
  }
  return { value: num, error: null };
}

function buildTrade(
  row: ZerodhaRow,
  rowNumber: number
): { trade: Trade | null; error: ParseError | null } {
  const symbol = row.symbol?.trim();
  if (!symbol) {
    return {
      trade: null,
      error: { row: rowNumber, reason: "Symbol is required" },
    };
  }

  const side = normalizeSide(row.trade_type);
  if (!side) {
    return {
      trade: null,
      error: {
        row: rowNumber,
        reason: `Invalid trade_type: '${row.trade_type}' (expected 'buy' or 'sell')`,
      },
    };
  }

  const dateResult = parseZerodhaDate(row.trade_date);
  if (!dateResult) {
    return {
      trade: null,
      error: {
        row: rowNumber,
        reason: `Invalid date format: '${row.trade_date}' (expected DD-MM-YYYY)`,
      },
    };
  }

  const qtyResult = parseNumber(row.quantity, "Quantity");
  if (qtyResult.error) {
    return { trade: null, error: { row: rowNumber, reason: qtyResult.error } };
  }

  if (qtyResult.value <= 0) {
    return {
      trade: null,
      error: {
        row: rowNumber,
        reason: `Quantity must be positive, got ${qtyResult.value}`,
      },
    };
  }

  const priceResult = parseNumber(row.price, "Price");
  if (priceResult.error) {
    return { trade: null, error: { row: rowNumber, reason: priceResult.error } };
  }

  if (priceResult.value <= 0) {
    return {
      trade: null,
      error: {
        row: rowNumber,
        reason: `Price must be positive, got ${priceResult.value}`,
      },
    };
  }

  const quantity = qtyResult.value;
  const price = priceResult.value;
  const totalAmount = side === "SELL" ? -(quantity * price) : quantity * price;
  const currency = inferCurrency(row.exchange ?? "");

  const rawData: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    rawData[key] = val;
  }

  const trade = {
    symbol,
    side,
    quantity,
    price,
    totalAmount,
    currency,
    executedAt: dateResult,
    broker: "zerodha",
    rawData,
  };

  return validateTrade(trade, rowNumber);
}

export function parseZerodhaCSV(csvText: string): ParseResult {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as ZerodhaRow[];

  const trades: Trade[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < records.length; i++) {
    const rowNumber = i + 1;
    const { trade, error } = buildTrade(records[i], rowNumber);

    if (trade) {
      trades.push(trade);
    } else if (error) {
      errors.push(error);
    }
  }

  return { trades, errors };
}
