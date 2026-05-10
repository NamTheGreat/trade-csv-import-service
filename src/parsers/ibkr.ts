import { parse } from "csv-parse/sync";
import type { ParseResult, Trade, ParseError } from "../types/trade.js";
import { validateTrade } from "../utils/validation.js";

interface IbkrRow {
  TradeID: string;
  AccountID: string;
  Symbol: string;
  DateTime: string;
  "Buy/Sell": string;
  Quantity: string;
  TradePrice: string;
  Currency: string;
  Commission: string;
  NetAmount: string;
  AssetClass: string;
  [key: string]: string;
}

function parseIbkrDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // ISO 8601 with timezone (e.g., 2026-04-01T14:30:00Z)
  const isoMatch = trimmed.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/
  );
  if (isoMatch) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return trimmed;
    }
    return null;
  }

  // MM/DD/YYYY without time (e.g., 04/03/2026)
  const usMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
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

  return null;
}

function normalizeSide(buySell: string): "BUY" | "SELL" | null {
  const normalized = buySell.trim().toUpperCase();
  if (normalized === "BOT") return "BUY";
  if (normalized === "SLD") return "SELL";
  return null;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().replace(/\./g, "/");
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
  row: IbkrRow,
  rowNumber: number
): { trade: Trade | null; error: ParseError | null } {
  const symbol = normalizeSymbol(row.Symbol);
  if (!symbol) {
    return {
      trade: null,
      error: { row: rowNumber, reason: "Symbol is required" },
    };
  }

  const side = normalizeSide(row["Buy/Sell"]);
  if (!side) {
    return {
      trade: null,
      error: {
        row: rowNumber,
        reason: `Invalid Buy/Sell: '${row["Buy/Sell"]}' (expected 'BOT' or 'SLD')`,
      },
    };
  }

  const dateResult = parseIbkrDate(row.DateTime);
  if (!dateResult) {
    return {
      trade: null,
      error: {
        row: rowNumber,
        reason: `Invalid date format: '${row.DateTime}' (expected ISO 8601 or MM/DD/YYYY)`,
      },
    };
  }

  const qtyResult = parseNumber(row.Quantity, "Quantity");
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

  const priceResult = parseNumber(row.TradePrice, "TradePrice");
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

  const currency = row.Currency?.trim();
  if (!currency || currency.length !== 3) {
    return {
      trade: null,
      error: {
        row: rowNumber,
        reason: `Currency must be a 3-letter code, got '${currency}'`,
      },
    };
  }

  const quantity = qtyResult.value;
  const price = priceResult.value;
  const totalAmount = side === "SELL" ? -(quantity * price) : quantity * price;

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
    broker: "ibkr",
    rawData,
  };

  return validateTrade(trade, rowNumber);
}

export function parseIbkrCSV(csvText: string): ParseResult {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as IbkrRow[];

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
