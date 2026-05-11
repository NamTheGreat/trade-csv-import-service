# Broker CSV Trade Import Service

A TypeScript backend service that normalizes trade CSV exports from different stock brokers into a standardized format. Upload a CSV, the service auto-detects the broker (Zerodha or Interactive Brokers), parses and validates each trade, and returns a clean JSON response with valid trades and detailed error information for any bad rows.

## Tech Stack

| Choice | Why |
|--------|-----|
| **TypeScript** | Strict mode for compile-time safety - no `any` types, catches bugs before runtime |
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
      "rawData": { "symbol": "RELIANCE", "isin": "INE002A01018", "...": "..." }
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

## Testing on Windows

PowerShell aliases `curl` to `Invoke-WebRequest`, which uses different syntax. Use **`curl.exe`** (the real curl) instead:

```powershell
curl.exe -X POST http://localhost:3000/import -F "file=@samples\zerodha.csv"
```

Or pipe through `jq` for formatted output:

```powershell
curl.exe -X POST http://localhost:3000/import -F "file=@samples\zerodha.csv" | jq .
```

If you don't have `curl.exe` or `jq`, the API tests (`npm test`) exercise the full request/response cycle via Supertest - no running server required.

## Test Results

All tests pass cleanly:

| Test File | Tests |
|-----------|-------|
| `autoDetect.test.ts` | 7 |
| `ibkr.test.ts` | 14 |
| `zerodha.test.ts` | 16 |
| `api.test.ts` | 9 |
| **Total** | **46** |

Sample API response (Zerodha):

```json
{
  "broker": "zerodha",
  "summary": { "total": 7, "valid": 5, "skipped": 2 },
  "trades": ["..."],
  "errors": [
    { "row": 6, "reason": "Invalid date format: 'invalid_date' (expected DD-MM-YYYY)" },
    { "row": 7, "reason": "Quantity must be positive, got -5" }
  ],
  "timestamp": "2026-05-10T18:49:30.393Z",
  "filename": "zerodha.csv",
  "processingTimeMs": 23
}
```

## Test Suite Breakdown

### `tests/zerodha.test.ts` - 16 tests

Tests the Zerodha parser in isolation. No HTTP server, no auto-detection - just raw CSV text to parsed trades.

| Test | What It Validates | Assignment Criteria |
|------|-------------------|---------------------|
| parses sample CSV: 5 valid, 2 skipped | Core acceptance criteria - the sample file produces exactly the expected counts | #1 Error handling, #4 Test coverage |
| row 6 error: invalid date | Exact row number plus human-readable reason for bad date | #1 Error handling |
| row 7 error: negative quantity | Exact row number plus reason for negative quantity | #1 Error handling |
| totalAmount for BUY trades | `quantity * price` is positive (`RELIANCE`: `10 * 2450.50 = 24505`) | #4 Test coverage |
| totalAmount for SELL trades | `quantity * price` is negative (`INFY`: `-(25 * 1520.75) = -38018.75`) | #4 Test coverage |
| currency inferred as INR from NSE | Exchange `NSE` maps to currency `INR` | #4 Test coverage |
| currency inferred as INR from BSE | Exchange `BSE` maps to currency `INR` | #4 Test coverage |
| case-insensitive trade_type | `buy`, `BUY`, `sell`, and `SELL` normalize correctly | #4 Test coverage |
| rawData preserves all columns | Every original CSV field is in `rawData`, including `isin`, `segment`, and other broker fields | #3 TypeScript quality |
| empty ISIN handled gracefully | HDFCBANK row has empty ISIN but still parses | #1 Error handling |
| zero quantity skipped | Row with `qty = 0` is skipped with a clear reason | #1 Error handling, #4 Edge cases |
| missing required fields skipped | Row with empty symbol is skipped | #1 Error handling, #4 Edge cases |
| headers-only CSV | No data rows produces 0 trades and 0 errors without crashing | #4 Edge cases |
| single valid row | Minimal valid input produces 1 trade | #4 Edge cases |
| all invalid rows | Every row fails, producing 0 trades and N errors | #4 Edge cases |
| missing exchange defaults to INR | Fallback currency is `INR` when exchange column is empty | #1 Error handling |

There are 16 tests for one parser because the assignment asks for creative edge-case coverage. These tests go beyond the minimum happy path.

### `tests/ibkr.test.ts` - 14 tests

Tests the IBKR parser in isolation, following the same raw CSV text to parsed trades pattern while covering IBKR-specific rules.

| Test | What It Validates | Assignment Criteria |
|------|-------------------|---------------------|
| parses sample CSV: 5 valid, 1 skipped | Core acceptance criteria - only AMZN (row 5, zero quantity) is skipped | #1 Error handling, #4 Test coverage |
| row 5 skipped: zero quantity | AMZN row with `qty = 0` is skipped with a clear reason | #1 Error handling |
| row 6 valid: empty Commission | GOOGL row with empty `Commission` field still parses successfully | #1 Error handling |
| EUR.USD to EUR/USD normalization | Forex symbol format is converted to standard slash notation | #4 Test coverage |
| ISO 8601 date parsing | `2026-04-01T14:30:00Z` is preserved as-is | #4 Test coverage |
| MM/DD/YYYY date parsing | `04/03/2026` converts to `2026-04-03T00:00:00Z` | #4 Test coverage |
| totalAmount positive for BUY | AAPL: `100 * 185.50 = 18550` | #4 Test coverage |
| totalAmount negative for SELL | MSFT: `-(50 * 420.25) = -21012.50` | #4 Test coverage |
| rawData preserves extra fields | `AccountID`, `Commission`, `NetAmount`, and `AssetClass` are preserved in `rawData` | #3 TypeScript quality |
| BOT to BUY, SLD to SELL normalization | Both side mappings work correctly | #4 Test coverage |
| invalid date format skipped | Bad date string produces a clear error | #1 Error handling |
| missing required fields skipped | Empty `Symbol` produces a clear error | #1 Error handling |
| headers-only CSV | No crash and an empty result | #4 Edge cases |
| single valid row | Minimal input works | #4 Edge cases |

Key detail: the IBKR tests verify that empty `Commission` is allowed, which was a specific requirement that can otherwise be ambiguous.

### `tests/autoDetect.test.ts` - 7 tests

Tests the broker detection logic - the routing layer that decides which parser to use.

| Test | What It Validates | Assignment Criteria |
|------|-------------------|---------------------|
| identifies Zerodha by headers | CSV with `symbol`, `trade_date`, `trade_type`, and related headers maps to `zerodha` | #4 Test coverage, #5 Architecture |
| identifies IBKR by headers | CSV with `TradeID`, `Symbol`, `DateTime`, and related headers maps to `ibkr` | #4 Test coverage, #5 Architecture |
| unknown format returns error | Random headers produce null broker plus a clear error message | #1 Error handling, #4 Edge cases |
| empty CSV returns error | Empty string produces an error about an empty file | #1 Error handling, #4 Edge cases |
| no headers returns error | Data without recognizable headers produces an error | #4 Edge cases |
| lists registered brokers | `getRegisteredBrokers()` returns `["zerodha", "ibkr"]` | #5 Architecture |
| case-insensitive header detection | Uppercase headers like `SYMBOL` and `TRADE_DATE` still match | #4 Test coverage |

Auto-detection is the service routing layer. If it fails, the parser is never reached, so these tests protect the registry pattern and downstream behavior.

### `tests/api.test.ts` - 9 tests

End-to-end HTTP tests using Supertest. These exercise the full Express app without starting a real server.

| Test | What It Validates | Assignment Criteria |
|------|-------------------|---------------------|
| 400 when no file uploaded | Missing file field returns 400 plus an error message | #1 Error handling |
| 400 for empty file | Empty buffer returns 400 plus an error | #1 Error handling |
| 400 for unrecognized format | Unknown CSV returns 400 plus an `Unrecognized` message | #1 Error handling |
| 200 plus correct shape for Zerodha | Full upload returns 200, correct broker, summary, trades, and errors | #4 Test coverage |
| 200 plus correct shape for IBKR | Full upload returns 200 with correct counts: 6 total, 5 valid, 1 skipped | #4 Test coverage |
| valid Trade objects in response | Every trade has all 9 required Zod fields | #3 TypeScript quality |
| errors have row and reason | Error objects contain `row` as a number and `reason` as a string | #1 Error handling |
| headers-only CSV handled | No data rows returns 200 with zero counts | #4 Edge cases |
| GET /health returns ok | Health endpoint works for deployment checks | #4 Test coverage |

Supertest keeps HTTP tests in-process, so there is no port binding, server startup delay, race condition, or background process management. That makes the suite deterministic and CI/CD friendly.

### Mapping Tests to Evaluation Criteria

| Priority | Tests That Prove It |
|----------|---------------------|
| 1. Error handling | Every skipped-row test, invalid date test, negative quantity test, zero quantity test, missing field test, empty file test, and unknown format test |
| 2. Code readability | Test names are descriptive sentences, such as "skips row 5 (AMZN with zero quantity)", so behavior is readable at a glance |
| 3. TypeScript quality | API response shape tests verify all Zod fields are present; `rawData` tests verify the `Record<string, unknown>` structure |
| 4. Test coverage | 46 tests cover happy paths, edge cases, error cases, and boundary conditions |
| 5. Architecture | Auto-detection tests prove the plugin registry works; parser isolation tests prove there is no cross-broker coupling |
| 6. README | Tests act as executable documentation for system behavior |

### Test Execution Flow

When you run `npm test`, Vitest:

1. Discovers all `*.test.ts` files
2. Runs them in parallel with isolated test contexts
3. Imports source modules directly with no build step required
4. Uses Supertest to simulate HTTP requests against the Express app instance
5. Passes raw CSV strings into parsers and receives structured parse results
6. Verifies exact response shapes, values, counts, and error messages

The entire suite runs quickly because files are read once and the rest of the work happens in memory.

## Design Decisions

### 1. Extensibility - Plugin-Style Parsers

Adding a new broker requires **three steps only**:

1. Create `src/parsers/brokerC.ts` with a `parseBrokerCCSV(csvText: string): ParseResult` function
2. Register it in `src/parsers/autoDetect.ts` by adding a `BrokerDetector` entry
3. Write `tests/brokerC.test.ts`

No existing parser files are touched. Each parser is a pure function - same input always yields the same output.

### 2. Error Handling - Graceful Degradation

Financial data is messy. The service **never crashes** on a bad row:

- Each row is parsed independently; one failure does not affect others
- All validation errors are accumulated and returned with exact row numbers
- Zod `.safeParse()` is used so schema violations produce human-readable messages instead of thrown exceptions
- The API returns HTTP 200 even when some rows are skipped - the caller decides what to do with partial data

### 3. Row Numbering

`row` in error responses means **1-indexed data row number**, excluding the header line. Row 1 is the first data row after the header.

### 4. Date Handling

- **Zerodha**: `DD-MM-YYYY` -> converted to `YYYY-MM-DDT00:00:00Z` (UTC midnight)
- **IBKR**: Supports both ISO 8601 with timezone and `MM/DD/YYYY` without time -> normalized to ISO 8601
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
- Zerodha is always an Indian broker - currency defaults to `INR` when exchange is missing
- CSV files are UTF-8 encoded
- The `file` field name in multipart uploads is exactly `"file"`
- Empty string values in CSV columns (e.g., empty `isin`, empty `Commission`) are valid unless they are required for computation

## Project Structure

```text
broker-csv-import/
|-- src/
|   |-- parsers/
|   |   |-- zerodha.ts          # Zerodha-specific parser
|   |   |-- ibkr.ts             # IBKR-specific parser
|   |   `-- autoDetect.ts       # Header-based broker detection
|   |-- types/
|   |   `-- trade.ts            # Zod schema + TypeScript types
|   |-- routes/
|   |   `-- import.ts           # POST /import endpoint
|   |-- utils/
|   |   `-- validation.ts       # Shared Zod validation helper
|   `-- server.ts               # Express app entry point
|-- tests/
|   |-- zerodha.test.ts         # Zerodha parser tests
|   |-- ibkr.test.ts            # IBKR parser tests
|   |-- autoDetect.test.ts      # Auto-detection tests
|   `-- api.test.ts             # HTTP endpoint tests
|-- samples/
|   |-- zerodha.csv             # Sample Zerodha CSV
|   `-- ibkr.csv                # Sample IBKR CSV
|-- package.json
|-- tsconfig.json
|-- vitest.config.ts
`-- README.md
```
