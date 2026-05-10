import { describe, it, expect } from "vitest";
import { parseIbkrCSV } from "../src/parsers/ibkr.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const samplePath = resolve(__dirname, "../samples/ibkr.csv");
const sampleCSV = readFileSync(samplePath, "utf-8");

describe("IBKR Parser", () => {
  it("parses the sample CSV with 5 valid trades and 1 skipped", () => {
    const result = parseIbkrCSV(sampleCSV);

    expect(result.trades).toHaveLength(5);
    expect(result.errors).toHaveLength(1);
  });

  it("skips row 5 (AMZN with zero quantity)", () => {
    const result = parseIbkrCSV(sampleCSV);

    const zeroQtyError = result.errors.find((e) => e.row === 5);
    expect(zeroQtyError).toBeDefined();
    expect(zeroQtyError!.reason).toContain("Quantity must be positive");
    expect(zeroQtyError!.reason).toContain("0");
  });

  it("accepts row 6 (GOOGL with empty Commission)", () => {
    const result = parseIbkrCSV(sampleCSV);

    const googl = result.trades.find((t) => t.symbol === "GOOGL");
    expect(googl).toBeDefined();
    expect(googl!.quantity).toBe(30);
    expect(googl!.price).toBeCloseTo(175.5, 2);
    expect(googl!.rawData).toHaveProperty("Commission", "");
  });

  it("normalizes EUR.USD to EUR/USD", () => {
    const result = parseIbkrCSV(sampleCSV);

    const forex = result.trades.find((t) => t.symbol === "EUR/USD");
    expect(forex).toBeDefined();
    expect(forex!.rawData).toHaveProperty("Symbol", "EUR.USD");
  });

  it("parses ISO 8601 dates correctly", () => {
    const result = parseIbkrCSV(sampleCSV);

    const aapl = result.trades.find((t) => t.symbol === "AAPL");
    expect(aapl!.executedAt).toBe("2026-04-01T14:30:00Z");
  });

  it("parses MM/DD/YYYY dates correctly", () => {
    const result = parseIbkrCSV(sampleCSV);

    const tsla = result.trades.find((t) => t.symbol === "TSLA");
    expect(tsla).toBeDefined();
    expect(tsla!.executedAt).toBe("2026-04-03T00:00:00Z");
  });

  it("calculates totalAmount as positive for BUY trades", () => {
    const result = parseIbkrCSV(sampleCSV);

    const aapl = result.trades.find((t) => t.symbol === "AAPL");
    expect(aapl!.side).toBe("BUY");
    expect(aapl!.totalAmount).toBeCloseTo(100 * 185.5, 2);
  });

  it("calculates totalAmount as negative for SELL trades", () => {
    const result = parseIbkrCSV(sampleCSV);

    const msft = result.trades.find((t) => t.symbol === "MSFT");
    expect(msft!.side).toBe("SELL");
    expect(msft!.totalAmount).toBeCloseTo(-(50 * 420.25), 2);
  });

  it("preserves all original columns in rawData including extra fields", () => {
    const result = parseIbkrCSV(sampleCSV);

    const aapl = result.trades.find((t) => t.symbol === "AAPL");
    expect(aapl!.rawData).toHaveProperty("TradeID", "U1234-001");
    expect(aapl!.rawData).toHaveProperty("AccountID", "U1234567");
    expect(aapl!.rawData).toHaveProperty("Symbol", "AAPL");
    expect(aapl!.rawData).toHaveProperty("Buy/Sell", "BOT");
    expect(aapl!.rawData).toHaveProperty("Commission", "-1.00");
    expect(aapl!.rawData).toHaveProperty("NetAmount", "18549.00");
    expect(aapl!.rawData).toHaveProperty("AssetClass", "STK");
  });

  it("normalizes BOT to BUY and SLD to SELL", () => {
    const csv = `TradeID,AccountID,Symbol,DateTime,Buy/Sell,Quantity,TradePrice,Currency,Commission,NetAmount,AssetClass
U1,ACC,A,2026-04-01T10:00:00Z,BOT,10,100,USD,0,1000,STK
U2,ACC,B,2026-04-01T10:00:00Z,SLD,10,100,USD,0,-1000,STK`;

    const result = parseIbkrCSV(csv);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0].side).toBe("BUY");
    expect(result.trades[1].side).toBe("SELL");
  });

  it("skips rows with invalid date formats", () => {
    const csv = `TradeID,AccountID,Symbol,DateTime,Buy/Sell,Quantity,TradePrice,Currency,Commission,NetAmount,AssetClass
U1,ACC,A,bad-date,BOT,10,100,USD,0,1000,STK`;

    const result = parseIbkrCSV(csv);
    expect(result.trades).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("Invalid date format");
  });

  it("skips rows with missing required fields", () => {
    const csv = `TradeID,AccountID,Symbol,DateTime,Buy/Sell,Quantity,TradePrice,Currency,Commission,NetAmount,AssetClass
U1,ACC,,2026-04-01T10:00:00Z,BOT,10,100,USD,0,1000,STK`;

    const result = parseIbkrCSV(csv);
    expect(result.trades).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("Symbol is required");
  });

  it("handles CSV with only headers", () => {
    const csv = `TradeID,AccountID,Symbol,DateTime,Buy/Sell,Quantity,TradePrice,Currency,Commission,NetAmount,AssetClass`;

    const result = parseIbkrCSV(csv);
    expect(result.trades).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("handles single valid row", () => {
    const csv = `TradeID,AccountID,Symbol,DateTime,Buy/Sell,Quantity,TradePrice,Currency,Commission,NetAmount,AssetClass
U1,ACC,A,2026-04-01T10:00:00Z,BOT,10,100,USD,0,1000,STK`;

    const result = parseIbkrCSV(csv);
    expect(result.trades).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});
