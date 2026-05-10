import { parse } from "csv-parse/sync";
import { parseZerodhaCSV } from "./zerodha.js";
import { parseIbkrCSV } from "./ibkr.js";
import type { ParseResult } from "../types/trade.js";

export type BrokerName = "zerodha" | "ibkr";

interface BrokerDetector {
  name: BrokerName;
  detect: (headers: string[]) => boolean;
  parse: (csvText: string) => ParseResult;
}

const ZERODHA_HEADERS = [
  "symbol",
  "trade_date",
  "trade_type",
  "quantity",
  "price",
  "exchange",
];

const IBKR_HEADERS = [
  "TradeID",
  "Symbol",
  "DateTime",
  "Buy/Sell",
  "Quantity",
  "TradePrice",
  "Currency",
];

function hasAllHeaders(headers: string[], required: string[]): boolean {
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());
  return required.every((req) => lowerHeaders.includes(req.toLowerCase()));
}

const brokers: BrokerDetector[] = [
  {
    name: "zerodha",
    detect: (headers) => hasAllHeaders(headers, ZERODHA_HEADERS),
    parse: parseZerodhaCSV,
  },
  {
    name: "ibkr",
    detect: (headers) => hasAllHeaders(headers, IBKR_HEADERS),
    parse: parseIbkrCSV,
  },
];

export function detectBroker(csvText: string): {
  broker: BrokerName | null;
  error: string | null;
} {
  const lines = csvText.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return { broker: null, error: "CSV file is empty" };
  }

  const headerLine = lines[0];
  let headers: string[];

  try {
    const parsed = parse(headerLine, { columns: false, trim: true });
    headers = parsed[0] as string[];
  } catch {
    return { broker: null, error: "Unable to parse CSV headers" };
  }

  if (headers.length === 0) {
    return { broker: null, error: "CSV has no headers" };
  }

  for (const broker of brokers) {
    if (broker.detect(headers)) {
      return { broker: broker.name, error: null };
    }
  }

  return {
    broker: null,
    error: `Unrecognized CSV format. Headers found: ${headers.join(", ")}`,
  };
}

export function parseCSV(csvText: string): {
  broker: BrokerName;
  result: ParseResult;
} {
  const { broker, error } = detectBroker(csvText);

  if (!broker || error) {
    throw new Error(error ?? "Unknown broker format");
  }

  const brokerConfig = brokers.find((b) => b.name === broker);
  if (!brokerConfig) {
    throw new Error(`Parser not found for broker: ${broker}`);
  }

  const result = brokerConfig.parse(csvText);
  return { broker, result };
}

export function getRegisteredBrokers(): BrokerName[] {
  return brokers.map((b) => b.name);
}
