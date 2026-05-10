import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/server.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const zerodhaPath = resolve(__dirname, "../samples/zerodha.csv");
const ibkrPath = resolve(__dirname, "../samples/ibkr.csv");
const zerodhaCSV = readFileSync(zerodhaPath, "utf-8");
const ibkrCSV = readFileSync(ibkrPath, "utf-8");

describe("POST /import", () => {
  it("returns 400 when no file is uploaded", async () => {
    const res = await request(app).post("/import");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No file uploaded");
  });

  it("returns 400 for empty file", async () => {
    const res = await request(app)
      .post("/import")
      .attach("file", Buffer.from(""), "empty.csv");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("empty");
  });

  it("returns 400 for unrecognized format", async () => {
    const res = await request(app)
      .post("/import")
      .attach("file", Buffer.from("foo,bar\n1,2"), "unknown.csv");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unrecognized");
  });

  it("returns 200 with correct response shape for Zerodha CSV", async () => {
    const res = await request(app)
      .post("/import")
      .attach("file", Buffer.from(zerodhaCSV), "zerodha.csv");

    expect(res.status).toBe(200);
    expect(res.body.broker).toBe("zerodha");
    expect(res.body.summary).toEqual({
      total: 7,
      valid: 5,
      skipped: 2,
    });
    expect(res.body.trades).toHaveLength(5);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.processingTimeMs).toBeDefined();
    expect(res.body.filename).toBe("zerodha.csv");
  });

  it("returns 200 with correct response shape for IBKR CSV", async () => {
    const res = await request(app)
      .post("/import")
      .attach("file", Buffer.from(ibkrCSV), "ibkr.csv");

    expect(res.status).toBe(200);
    expect(res.body.broker).toBe("ibkr");
    expect(res.body.summary).toEqual({
      total: 6,
      valid: 5,
      skipped: 1,
    });
    expect(res.body.trades).toHaveLength(5);
    expect(res.body.errors).toHaveLength(1);
  });

  it("returns valid Trade objects in the trades array", async () => {
    const res = await request(app)
      .post("/import")
      .attach("file", Buffer.from(zerodhaCSV), "zerodha.csv");

    const trade = res.body.trades[0];
    expect(trade).toHaveProperty("symbol");
    expect(trade).toHaveProperty("side");
    expect(trade).toHaveProperty("quantity");
    expect(trade).toHaveProperty("price");
    expect(trade).toHaveProperty("totalAmount");
    expect(trade).toHaveProperty("currency");
    expect(trade).toHaveProperty("executedAt");
    expect(trade).toHaveProperty("broker");
    expect(trade).toHaveProperty("rawData");
  });

  it("returns errors with row numbers and reasons", async () => {
    const res = await request(app)
      .post("/import")
      .attach("file", Buffer.from(zerodhaCSV), "zerodha.csv");

    const error = res.body.errors[0];
    expect(error).toHaveProperty("row");
    expect(error).toHaveProperty("reason");
    expect(typeof error.row).toBe("number");
    expect(typeof error.reason).toBe("string");
  });

  it("handles CSV with only headers", async () => {
    const csv = `symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment`;
    const res = await request(app)
      .post("/import")
      .attach("file", Buffer.from(csv), "headers-only.csv");

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ total: 0, valid: 0, skipped: 0 });
  });
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
