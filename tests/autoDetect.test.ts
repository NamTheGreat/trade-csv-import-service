import { describe, it, expect } from "vitest";
import { detectBroker, getRegisteredBrokers } from "../src/parsers/autoDetect.js";

describe("Auto-Detection", () => {
  it("identifies Zerodha format by column headers", () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
RELIANCE,ISIN,01-04-2026,buy,10,100,TRD1,ORD1,NSE,EQ`;

    const result = detectBroker(csv);
    expect(result.broker).toBe("zerodha");
    expect(result.error).toBeNull();
  });

  it("identifies IBKR format by column headers", () => {
    const csv = `TradeID,AccountID,Symbol,DateTime,Buy/Sell,Quantity,TradePrice,Currency,Commission,NetAmount,AssetClass
U1,ACC,AAPL,2026-04-01T10:00:00Z,BOT,100,185.50,USD,-1,18549,STK`;

    const result = detectBroker(csv);
    expect(result.broker).toBe("ibkr");
    expect(result.error).toBeNull();
  });

  it("returns error for unknown format", () => {
    const csv = `foo,bar,baz
1,2,3`;

    const result = detectBroker(csv);
    expect(result.broker).toBeNull();
    expect(result.error).toContain("Unrecognized CSV format");
  });

  it("returns error for empty CSV", () => {
    const result = detectBroker("");
    expect(result.broker).toBeNull();
    expect(result.error).toContain("empty");
  });

  it("returns error for CSV with no headers", () => {
    const csv = `just,some,data
1,2,3`;

    const result = detectBroker(csv);
    expect(result.broker).toBeNull();
    expect(result.error).toContain("Unrecognized");
  });

  it("lists registered brokers", () => {
    const brokers = getRegisteredBrokers();
    expect(brokers).toContain("zerodha");
    expect(brokers).toContain("ibkr");
    expect(brokers).toHaveLength(2);
  });

  it("is case-insensitive for Zerodha header detection", () => {
    const csv = `SYMBOL,ISIN,TRADE_DATE,TRADE_TYPE,QUANTITY,PRICE,TRADE_ID,ORDER_ID,EXCHANGE,SEGMENT
RELIANCE,ISIN,01-04-2026,buy,10,100,TRD1,ORD1,NSE,EQ`;

    const result = detectBroker(csv);
    expect(result.broker).toBe("zerodha");
  });
});
