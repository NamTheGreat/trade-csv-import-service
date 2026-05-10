import { describe, it, expect } from "vitest";
import { parseZerodhaCSV } from "../src/parsers/zerodha.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const samplePath = resolve(__dirname, "../samples/zerodha.csv");
const sampleCSV = readFileSync(samplePath, "utf-8");

describe("Zerodha Parser", () => {
  it("parses the sample CSV with 5 valid trades and 2 skipped", () => {
    const result = parseZerodhaCSV(sampleCSV);

    expect(result.trades).toHaveLength(5);
    expect(result.errors).toHaveLength(2);
  });

  it("returns correct error for row 6 (invalid date)", () => {
    const result = parseZerodhaCSV(sampleCSV);

    const dateError = result.errors.find((e) => e.row === 6);
    expect(dateError).toBeDefined();
    expect(dateError!.reason).toContain("Invalid date format");
    expect(dateError!.reason).toContain("invalid_date");
  });

  it("returns correct error for row 7 (negative quantity)", () => {
    const result = parseZerodhaCSV(sampleCSV);

    const qtyError = result.errors.find((e) => e.row === 7);
    expect(qtyError).toBeDefined();
    expect(qtyError!.reason).toContain("Quantity must be positive");
    expect(qtyError!.reason).toContain("-5");
  });

  it("calculates totalAmount correctly for BUY trades", () => {
    const result = parseZerodhaCSV(sampleCSV);

    const reliance = result.trades.find((t) => t.symbol === "RELIANCE");
    expect(reliance).toBeDefined();
    expect(reliance!.totalAmount).toBeCloseTo(10 * 2450.5, 2);
    expect(reliance!.side).toBe("BUY");
  });

  it("calculates totalAmount correctly for SELL trades (negative)", () => {
    const result = parseZerodhaCSV(sampleCSV);

    const infy = result.trades.find((t) => t.symbol === "INFY");
    expect(infy).toBeDefined();
    expect(infy!.side).toBe("SELL");
    expect(infy!.totalAmount).toBeCloseTo(-(25 * 1520.75), 2);
  });

  it("infers currency as INR from NSE exchange", () => {
    const result = parseZerodhaCSV(sampleCSV);

    const reliance = result.trades.find((t) => t.symbol === "RELIANCE");
    expect(reliance!.currency).toBe("INR");
  });

  it("infers currency as INR from BSE exchange", () => {
    const result = parseZerodhaCSV(sampleCSV);

    const tata = result.trades.find((t) => t.symbol === "TATAMOTORS");
    expect(tata!.currency).toBe("INR");
  });

  it("handles case-insensitive trade_type (buy, BUY, sell, SELL)", () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
A,ISIN1,01-04-2026,buy,10,100,TRD1,ORD1,NSE,EQ
B,ISIN2,01-04-2026,BUY,10,100,TRD2,ORD2,NSE,EQ
C,ISIN3,01-04-2026,sell,10,100,TRD3,ORD3,NSE,EQ
D,ISIN4,01-04-2026,SELL,10,100,TRD4,ORD4,NSE,EQ`;

    const result = parseZerodhaCSV(csv);
    expect(result.trades).toHaveLength(4);
    expect(result.trades[0].side).toBe("BUY");
    expect(result.trades[1].side).toBe("BUY");
    expect(result.trades[2].side).toBe("SELL");
    expect(result.trades[3].side).toBe("SELL");
  });

  it("preserves all original columns in rawData", () => {
    const result = parseZerodhaCSV(sampleCSV);

    const reliance = result.trades.find((t) => t.symbol === "RELIANCE");
    expect(reliance!.rawData).toHaveProperty("symbol", "RELIANCE");
    expect(reliance!.rawData).toHaveProperty("isin", "INE002A01018");
    expect(reliance!.rawData).toHaveProperty("trade_date", "01-04-2026");
    expect(reliance!.rawData).toHaveProperty("trade_type", "buy");
    expect(reliance!.rawData).toHaveProperty("exchange", "NSE");
    expect(reliance!.rawData).toHaveProperty("segment", "EQ");
  });

  it("handles empty ISIN gracefully", () => {
    const result = parseZerodhaCSV(sampleCSV);

    const hdfc = result.trades.find((t) => t.symbol === "HDFCBANK");
    expect(hdfc).toBeDefined();
    expect(hdfc!.rawData).toHaveProperty("isin", "");
  });

  it("skips rows with zero quantity", () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
A,ISIN1,01-04-2026,buy,0,100,TRD1,ORD1,NSE,EQ`;

    const result = parseZerodhaCSV(csv);
    expect(result.trades).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("Quantity must be positive");
  });

  it("skips rows with missing required fields", () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
,,01-04-2026,buy,10,100,TRD1,ORD1,NSE,EQ`;

    const result = parseZerodhaCSV(csv);
    expect(result.trades).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("Symbol is required");
  });

  it("handles CSV with only headers (no data rows)", () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment`;

    const result = parseZerodhaCSV(csv);
    expect(result.trades).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("handles single valid row", () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
A,ISIN1,01-04-2026,buy,10,100,TRD1,ORD1,NSE,EQ`;

    const result = parseZerodhaCSV(csv);
    expect(result.trades).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.trades[0].symbol).toBe("A");
  });

  it("handles all invalid rows", () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
A,ISIN1,invalid,buy,10,100,TRD1,ORD1,NSE,EQ
B,ISIN2,01-04-2026,buy,-5,100,TRD2,ORD2,NSE,EQ`;

    const result = parseZerodhaCSV(csv);
    expect(result.trades).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  it("defaults currency to INR when exchange is missing", () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
A,ISIN1,01-04-2026,buy,10,100,TRD1,ORD1,,EQ`;

    const result = parseZerodhaCSV(csv);
    expect(result.trades[0].currency).toBe("INR");
  });
});
