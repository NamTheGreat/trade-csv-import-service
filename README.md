# Broker CSV Trade Import Service

A TypeScript backend service that normalizes trade CSV exports from different stock brokers into a standardized format. Upload a CSV, the service auto-detects the broker (Zerodha or Interactive Brokers), parses and validates each trade, and returns a clean JSON response with valid trades and detailed error information for any bad rows.

## Tech Stack

| Choice | Why |
|--------|-----|
| **TypeScript** | Strict mode for compile-time safety — no `any` types, catches bugs before runtime |
| **Express** | Mature, well-documented, minimal boilerplate for a single-endpoint service |
| **csv-parse** | Fast, streaming-capable CSV parser with robust header/column support |
| **Zod** | Schema-first validation with `.safeParse()` for graceful error collection |
| **Vitest** | Fast, modern test runner with built-in TypeScript support and coverage |
| **Supertest** | Clean HTTP assertion library for endpoint testing without running a real server |

## Installation

```bash
npm install
```

## Run the Server

```bash
npm start
```

The server starts on **port 3000** (or set `PORT` env var). A health check is available at `GET /health`.

## Run Tests

```bash
npm test              # run all tests once
npm run test:watch    # run in watch mode
npm run test:coverage # run with coverage report
```

## API Usage

### POST /import

Upload a CSV file via multipart/form-data:

```bash
curl -X POST http://localhost:3000/import \
  -F "file=@samples/zerodha.csv" \
  | jq .
```

**Response shape:**
```json
{
  "broker": "zerodha",
  "summary": { "total": 7, "valid": 5, "skipped": 2 },
  "trades": [
    {
      "symbol": "RELIANCE",
      "side": "BUY",
      "quantity": 10,
      "price": 2450.50,
      "totalAmount": 24505.00,
      "currency": "INR",
      "executedAt": "2026-04-01T00:00:00Z",
      "broker": "zerodha",
      "rawData": { "symbol": "RELIANCE", "isin": "INE002A01018", ... }
    }
  ],
  "errors": [
    { "row": 6, "reason": "Invalid date format: 'invalid_date' (expected DD-MM-YYYY)" },
    { "row": 7, "reason": "Quantity must be positive, got -5" }
  ],
  "timestamp": "2026-05-10T23:30:00.000Z",
  "filename": "zerodha.csv",
  "processingTimeMs": 12
}
```

## Design Decisions

### 1. Extensibility — Plugin-Style Parsers
Adding a new broker requires **three steps only**:
1. Create `src/parsers/brokerC.ts` with a `parseBrokerCCSV(csvText: string): ParseResult` function
2. Register it in `src/parsers/autoDetect.ts` by adding a `BrokerDetector` entry
3. Write `tests/brokerC.test.ts`

No existing parser files are touched. Each parser is a pure function — same input always yields the same output.

### 2. Error Handling — Graceful Degradation
Financial data is messy. The service **never crashes** on a bad row:
- Each row is parsed independently; one failure does not affect others
- All validation errors are accumulated and returned with exact row numbers
- Zod `.safeParse()` is used so schema violations produce human-readable messages instead of thrown exceptions
- The API returns HTTP 200 even when some rows are skipped — the caller decides what to do with partial data

### 3. Row Numbering
`row` in error responses means **1-indexed data row number**, excluding the header line. Row 1 is the first data row after the header.

### 4. Date Handling
- **Zerodha**: `DD-MM-YYYY` → converted to `YYYY-MM-DDT00:00:00Z` (UTC midnight)
- **IBKR**: Supports both ISO 8601 with timezone and `MM/DD/YYYY` without time → normalized to ISO 8601
- All dates without explicit timezone info are assumed to be **UTC**

### 5. Currency Inference
- **Zerodha**: No currency column exists. Inferred as `INR` from exchange (`NSE`/`BSE`). Falls back to `INR` if exchange is missing or unrecognized.
- **IBKR**: Read directly from the `Currency` column.

### 6. `rawData` Preservation
Every field from the original CSV row is stored in `rawData`, including fields that were mapped to standard Trade properties. This ensures no data is lost and original broker-specific values remain accessible.

### 7. totalAmount Calculation
Always computed as `quantity * price`, with sign flipped for SELL trades (`-(quantity * price)`). This is independent of any `NetAmount` column the broker may provide.

## Assumptions

- Dates without timezone information are treated as **UTC** (`T00:00:00Z`)
- Zerodha is always an Indian broker — currency defaults to `INR` when exchange is missing
- CSV files are UTF-8 encoded
- The `file` field name in multipart uploads is exactly `"file"`
- Empty string values in CSV columns (e.g., empty `isin`, empty `Commission`) are valid unless they are required for computation

## Project Structure

```
broker-csv-import/
├── src/
│   ├── parsers/
│   │   ├── zerodha.ts          # Zerodha-specific parser
│   │   ├── ibkr.ts             # IBKR-specific parser
│   │   └── autoDetect.ts       # Header-based broker detection
│   ├── types/
│   │   └── trade.ts            # Zod schema + TypeScript types
│   ├── routes/
│   │   └── import.ts           # POST /import endpoint
│   ├── utils/
│   │   └── validation.ts       # Shared Zod validation helper
│   └── server.ts               # Express app entry point
├── tests/
│   ├── zerodha.test.ts         # Zerodha parser tests
│   ├── ibkr.test.ts            # IBKR parser tests
│   ├── autoDetect.test.ts      # Auto-detection tests
│   └── api.test.ts             # HTTP endpoint tests
├── samples/
│   ├── zerodha.csv             # Sample Zerodha CSV
│   └── ibkr.csv                # Sample IBKR CSV
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```
